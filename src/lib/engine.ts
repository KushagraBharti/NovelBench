import {
  BenchmarkRun,
  BenchmarkProgress,
  Critique,
  Idea,
  Ranking,
  RankingEntry,
} from "@/types";
import { callModel } from "./openrouter";
import { getAllModels, getModelById } from "./models";
import { getCategoryById } from "./categories";
import {
  buildGeneratePrompt,
  buildCritiquePrompt,
  buildRevisionPrompt,
  buildVotingPrompt,
} from "./prompts";
import { saveBenchmarkRun } from "./storage";

function generateId(): string {
  return `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseCritiqueScore(content: string): number {
  // Look for patterns like "Score: 7/10" or "**Score:** 8/10" or "[7/10]"
  const patterns = [
    /\*?\*?Score:?\*?\*?\s*\[?(\d+)\/10\]?/i,
    /(\d+)\s*\/\s*10/,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const score = parseInt(match[1], 10);
      if (score >= 1 && score <= 10) return score;
    }
  }
  return 5; // default if parsing fails
}

function parseRankings(
  content: string,
  modelIds: string[]
): RankingEntry[] {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*"rankings"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.rankings)) {
        return parsed.rankings.map(
          (r: { modelId: string; rank: number; reasoning: string }) => ({
            modelId: r.modelId,
            rank: r.rank,
            reasoning: r.reasoning || "",
          })
        );
      }
    }
  } catch {
    // JSON parsing failed, try manual extraction
  }

  // Fallback: return models in order they appear
  return modelIds.map((id, i) => ({
    modelId: id,
    rank: i + 1,
    reasoning: "Could not parse ranking",
  }));
}

export async function* runBenchmark(
  categoryId: string,
  prompt: string
): AsyncGenerator<BenchmarkProgress> {
  const category = getCategoryById(categoryId);
  if (!category) throw new Error(`Unknown category: ${categoryId}`);

  const models = getAllModels();

  const run: BenchmarkRun = {
    id: generateId(),
    categoryId,
    prompt,
    timestamp: new Date().toISOString(),
    status: "generating",
    ideas: [],
    critiques: [],
    round1Rankings: [],
    revisedIdeas: [],
    round2Rankings: [],
  };

  // Save initial state
  await saveBenchmarkRun(run);

  // --- Step 1: Generate ideas ---
  run.status = "generating";
  yield { status: "generating", step: "Generating ideas from all models...", run: { ...run } };

  const generatePrompt = buildGeneratePrompt(category.name, prompt);
  const ideaResults = await Promise.allSettled(
    models.map(async (model) => {
      const content = await callModel(model.openRouterId, [
        { role: "user", content: generatePrompt },
      ]);
      return {
        modelId: model.id,
        content,
        timestamp: new Date().toISOString(),
      } as Idea;
    })
  );

  run.ideas = ideaResults
    .filter(
      (r): r is PromiseFulfilledResult<Idea> => r.status === "fulfilled"
    )
    .map((r) => r.value);

  await saveBenchmarkRun(run);

  if (run.ideas.length < 2) {
    run.status = "error";
    run.error = "Too few models responded. Need at least 2 ideas.";
    await saveBenchmarkRun(run);
    yield { status: "error", step: run.error, run: { ...run } };
    return;
  }

  // --- Step 2: Critique + Round 1 voting ---
  run.status = "critiquing";
  yield { status: "critiquing", step: "Models are critiquing each other's ideas...", run: { ...run } };

  // Each model critiques every other model's idea
  const critiquePromises: Promise<Critique>[] = [];
  for (const judge of models) {
    const judgeIdea = run.ideas.find((i) => i.modelId === judge.id);
    if (!judgeIdea) continue; // skip if this model didn't produce an idea

    for (const idea of run.ideas) {
      if (idea.modelId === judge.id) continue; // don't critique yourself

      critiquePromises.push(
        (async () => {
          const critiqueContent = await callModel(judge.openRouterId, [
            {
              role: "user",
              content: buildCritiquePrompt(idea, category.name, prompt),
            },
          ]);
          return {
            fromModelId: judge.id,
            toModelId: idea.modelId,
            content: critiqueContent,
            score: parseCritiqueScore(critiqueContent),
          } as Critique;
        })()
      );
    }
  }

  const critiqueResults = await Promise.allSettled(critiquePromises);
  run.critiques = critiqueResults
    .filter(
      (r): r is PromiseFulfilledResult<Critique> => r.status === "fulfilled"
    )
    .map((r) => r.value);

  // Round 1 voting
  const votingPromises1 = models
    .filter((m) => run.ideas.some((i) => i.modelId === m.id))
    .map(async (judge) => {
      const content = await callModel(judge.openRouterId, [
        {
          role: "user",
          content: buildVotingPrompt(
            run.ideas,
            category.name,
            prompt,
            "initial"
          ),
        },
      ]);
      return {
        judgeModelId: judge.id,
        rankings: parseRankings(
          content,
          run.ideas.map((i) => i.modelId)
        ),
      } as Ranking;
    });

  const votingResults1 = await Promise.allSettled(votingPromises1);
  run.round1Rankings = votingResults1
    .filter(
      (r): r is PromiseFulfilledResult<Ranking> => r.status === "fulfilled"
    )
    .map((r) => r.value);

  await saveBenchmarkRun(run);

  // --- Step 3: Revise ---
  run.status = "revising";
  yield { status: "revising", step: "Models are revising their ideas based on critiques...", run: { ...run } };

  const revisionPromises = run.ideas.map(async (idea) => {
    const model = getModelById(idea.modelId);
    if (!model) throw new Error(`Model not found: ${idea.modelId}`);

    const critiquesForIdea = run.critiques.filter(
      (c) => c.toModelId === idea.modelId
    );

    const content = await callModel(model.openRouterId, [
      {
        role: "user",
        content: buildRevisionPrompt(
          idea,
          critiquesForIdea,
          category.name,
          prompt
        ),
      },
    ]);

    return {
      modelId: idea.modelId,
      content,
      timestamp: new Date().toISOString(),
    } as Idea;
  });

  const revisionResults = await Promise.allSettled(revisionPromises);
  run.revisedIdeas = revisionResults
    .filter(
      (r): r is PromiseFulfilledResult<Idea> => r.status === "fulfilled"
    )
    .map((r) => r.value);

  await saveBenchmarkRun(run);

  // --- Step 4: Round 2 voting ---
  run.status = "voting";
  yield { status: "voting", step: "Final round of voting on revised ideas...", run: { ...run } };

  const votingPromises2 = models
    .filter((m) => run.revisedIdeas.some((i) => i.modelId === m.id))
    .map(async (judge) => {
      const content = await callModel(judge.openRouterId, [
        {
          role: "user",
          content: buildVotingPrompt(
            run.revisedIdeas,
            category.name,
            prompt,
            "revised"
          ),
        },
      ]);
      return {
        judgeModelId: judge.id,
        rankings: parseRankings(
          content,
          run.revisedIdeas.map((i) => i.modelId)
        ),
      } as Ranking;
    });

  const votingResults2 = await Promise.allSettled(votingPromises2);
  run.round2Rankings = votingResults2
    .filter(
      (r): r is PromiseFulfilledResult<Ranking> => r.status === "fulfilled"
    )
    .map((r) => r.value);

  // --- Done ---
  run.status = "complete";
  await saveBenchmarkRun(run);

  yield { status: "complete", step: "Benchmark complete!", run: { ...run } };
}
