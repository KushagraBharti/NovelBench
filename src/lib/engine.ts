import {
  BenchmarkRun,
  BenchmarkProgress,
  CritiqueEntry,
  CritiqueVoteResult,
  Idea,
  IdeaContent,
  Ranking,
  RankingEntry,
} from "@/types";
import { callModel } from "./openrouter";
import { getAllModels, getModelById } from "./models";
import { getCategoryById } from "./categories";
import {
  buildGeneratePrompt,
  buildCritiqueVotePrompt,
  buildRevisionPrompt,
  buildFinalVotePrompt,
} from "./prompts";
import { saveBenchmarkRun } from "./storage";

const ANONYMOUS_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function generateId(): string {
  return `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildAnonymousMap(modelIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  modelIds.forEach((id, i) => map.set(id, ANONYMOUS_LABELS[i]));
  return map;
}

function parseIdeaJson(raw: string): IdeaContent {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed as IdeaContent;
    }
  } catch {
    // Fall through
  }
  // Fallback: treat entire response as description
  return {
    title: "Untitled",
    summary: "",
    description: raw,
    novelty: "",
  };
}

function parseCritiqueVoteJson(
  raw: string,
  anonymousMap: Map<string, string>
): { critiques: CritiqueEntry[]; rankings: RankingEntry[] } {
  // Build reverse map: label -> modelId
  const labelToModel = new Map<string, string>();
  for (const [modelId, label] of anonymousMap) {
    labelToModel.set(label, modelId);
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      const critiques: CritiqueEntry[] = (parsed.critiques || []).map(
        (c: { ideaLabel: string; strengths: string; weaknesses: string; suggestions: string; score: number }) => ({
          ideaLabel: c.ideaLabel,
          targetModelId: labelToModel.get(c.ideaLabel) || c.ideaLabel,
          strengths: c.strengths || "",
          weaknesses: c.weaknesses || "",
          suggestions: c.suggestions || "",
          score: clampScore(c.score),
        })
      );

      const rankings: RankingEntry[] = (parsed.rankings || []).map(
        (r: { label: string; rank: number; score: number; reasoning: string }) => ({
          modelId: labelToModel.get(r.label) || r.label,
          rank: r.rank,
          score: clampScore(r.score),
          reasoning: r.reasoning || "",
        })
      );

      return { critiques, rankings };
    }
  } catch {
    // Fall through
  }

  return { critiques: [], rankings: [] };
}

function parseFinalVoteJson(
  raw: string,
  anonymousMap: Map<string, string>
): RankingEntry[] {
  const labelToModel = new Map<string, string>();
  for (const [modelId, label] of anonymousMap) {
    labelToModel.set(label, modelId);
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.rankings)) {
        return parsed.rankings.map(
          (r: { label: string; rank: number; score: number; reasoning: string }) => ({
            modelId: labelToModel.get(r.label) || r.label,
            rank: r.rank,
            score: clampScore(r.score),
            reasoning: r.reasoning || "",
          })
        );
      }
    }
  } catch {
    // Fall through
  }

  // Fallback
  return [...anonymousMap.keys()].map((id, i) => ({
    modelId: id,
    rank: i + 1,
    score: 5,
    reasoning: "Could not parse ranking",
  }));
}

function clampScore(score: number): number {
  if (typeof score !== "number" || isNaN(score)) return 5;
  return Math.max(1, Math.min(10, Math.round(score)));
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
    critiqueVotes: [],
    revisedIdeas: [],
    finalRankings: [],
  };

  await saveBenchmarkRun(run);

  // --- Step 1: Generate ideas ---
  run.status = "generating";
  yield { status: "generating", step: "Generating ideas from all models...", run: { ...run } };

  const generatePrompt = buildGeneratePrompt(category, prompt);
  const ideaResults = await Promise.allSettled(
    models.map(async (model) => {
      const raw = await callModel(model.openRouterId, [
        { role: "system", content: generatePrompt.system },
        { role: "user", content: generatePrompt.user },
      ]);
      return {
        modelId: model.id,
        content: parseIdeaJson(raw),
        raw,
        timestamp: new Date().toISOString(),
      } as Idea;
    })
  );

  run.ideas = ideaResults
    .filter((r): r is PromiseFulfilledResult<Idea> => r.status === "fulfilled")
    .map((r) => r.value);

  await saveBenchmarkRun(run);

  if (run.ideas.length < 2) {
    run.status = "error";
    run.error = "Too few models responded. Need at least 2 ideas.";
    await saveBenchmarkRun(run);
    yield { status: "error", step: run.error, run: { ...run } };
    return;
  }

  // Build anonymous mapping
  const anonymousMap = buildAnonymousMap(run.ideas.map((i) => i.modelId));

  // --- Step 2: Combined Critique + Vote ---
  run.status = "critiquing";
  yield { status: "critiquing", step: "Models are critiquing and ranking each other's ideas...", run: { ...run } };

  const critiqueVotePromises = run.ideas.map(async (judgeIdea) => {
    const model = getModelById(judgeIdea.modelId);
    if (!model) throw new Error(`Model not found: ${judgeIdea.modelId}`);

    const { system, user } = buildCritiqueVotePrompt(
      run.ideas,
      judgeIdea.modelId,
      category,
      prompt,
      anonymousMap
    );

    const raw = await callModel(model.openRouterId, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const { critiques, rankings } = parseCritiqueVoteJson(raw, anonymousMap);

    return {
      fromModelId: judgeIdea.modelId,
      critiques,
      rankings,
    } as CritiqueVoteResult;
  });

  const critiqueVoteResults = await Promise.allSettled(critiqueVotePromises);
  run.critiqueVotes = critiqueVoteResults
    .filter((r): r is PromiseFulfilledResult<CritiqueVoteResult> => r.status === "fulfilled")
    .map((r) => r.value);

  await saveBenchmarkRun(run);

  // --- Step 3: Revise ---
  run.status = "revising";
  yield { status: "revising", step: "Models are revising their ideas based on critiques...", run: { ...run } };

  const revisionPromises = run.ideas.map(async (idea) => {
    const model = getModelById(idea.modelId);
    if (!model) throw new Error(`Model not found: ${idea.modelId}`);

    // Gather all critiques directed at this model
    const critiquesForIdea: CritiqueEntry[] = [];
    for (const cv of run.critiqueVotes) {
      for (const critique of cv.critiques) {
        if (critique.targetModelId === idea.modelId) {
          critiquesForIdea.push(critique);
        }
      }
    }

    const { system, user } = buildRevisionPrompt(
      idea,
      critiquesForIdea,
      category,
      prompt
    );

    const raw = await callModel(model.openRouterId, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    return {
      modelId: idea.modelId,
      content: parseIdeaJson(raw),
      raw,
      timestamp: new Date().toISOString(),
    } as Idea;
  });

  const revisionResults = await Promise.allSettled(revisionPromises);
  run.revisedIdeas = revisionResults
    .filter((r): r is PromiseFulfilledResult<Idea> => r.status === "fulfilled")
    .map((r) => r.value);

  await saveBenchmarkRun(run);

  // --- Step 4: Final Voting ---
  run.status = "voting";
  yield { status: "voting", step: "Final round of voting on revised ideas...", run: { ...run } };

  // Re-map for revised ideas (same models, same labels for consistency)
  const revisedAnonymousMap = buildAnonymousMap(run.revisedIdeas.map((i) => i.modelId));

  const finalVotePromises = run.revisedIdeas.map(async (judgeIdea) => {
    const model = getModelById(judgeIdea.modelId);
    if (!model) throw new Error(`Model not found: ${judgeIdea.modelId}`);

    const { system, user } = buildFinalVotePrompt(
      run.revisedIdeas,
      category,
      prompt,
      revisedAnonymousMap
    );

    const raw = await callModel(model.openRouterId, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    return {
      judgeModelId: judgeIdea.modelId,
      rankings: parseFinalVoteJson(raw, revisedAnonymousMap),
    } as Ranking;
  });

  const finalVoteResults = await Promise.allSettled(finalVotePromises);
  run.finalRankings = finalVoteResults
    .filter((r): r is PromiseFulfilledResult<Ranking> => r.status === "fulfilled")
    .map((r) => r.value);

  // --- Done ---
  run.status = "complete";
  await saveBenchmarkRun(run);

  yield { status: "complete", step: "Benchmark complete!", run: { ...run } };
}
