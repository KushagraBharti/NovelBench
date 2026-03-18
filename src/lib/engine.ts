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
import { callModel, streamModel, ChatMessage, ReasoningConfig } from "./openrouter";
import { getAllModels, getModelById, getModelName } from "./models";
import { getCategoryById } from "./categories";
import {
  buildGeneratePrompt,
  buildCritiqueVotePrompt,
  buildRevisionPrompt,
  buildFinalVotePrompt,
} from "./prompts";
import { saveBenchmarkRun } from "./storage";

const ANONYMOUS_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// Per-stage reasoning config — creative tasks get more thinking, analytical tasks less
const REASONING_GENERATE: ReasoningConfig = { effort: "medium", exclude: true };
const REASONING_CRITIQUE: ReasoningConfig = { effort: "low", exclude: true };
const REASONING_REVISE: ReasoningConfig = { effort: "medium", exclude: true };
const REASONING_VOTE: ReasoningConfig = { effort: "low", exclude: true };

const MODEL_TIMEOUT_MS = 90_000; // 90 seconds per model call

function generateId(): string {
  return `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildAnonymousMap(modelIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  modelIds.forEach((id, i) => map.set(id, ANONYMOUS_LABELS[i]));
  return map;
}

/**
 * Fisher-Yates shuffle — returns a new shuffled copy of the array.
 * Uses a simple seed derived from a string for per-judge reproducibility.
 */
function shuffleArray<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  // Simple seeded PRNG (mulberry32)
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  function nextRand(): number {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// --- JSON Parsing ---

function parseIdeaJson(raw: string): IdeaContent {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.title !== "Untitled") {
        return parsed as IdeaContent;
      }
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
      if (Array.isArray(parsed.rankings) && parsed.rankings.length > 0) {
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

// --- Retry with correction message ---

const JSON_RETRY_MESSAGE = "Your response was not valid JSON. Please respond with ONLY valid JSON in the exact format specified above. No markdown, no explanation — just the JSON object.";

async function callModelWithJsonRetry(
  openRouterId: string,
  messages: ChatMessage[],
  reasoning: ReasoningConfig,
  validateFn: (raw: string) => boolean
): Promise<string> {
  const raw = await callModel(openRouterId, messages, {
    reasoning,
    timeoutMs: MODEL_TIMEOUT_MS,
  });

  // If parse succeeded, return immediately
  if (validateFn(raw)) {
    return raw;
  }

  // Retry once with the broken response + correction message
  const retryMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: raw },
    { role: "user", content: JSON_RETRY_MESSAGE },
  ];

  const retryRaw = await callModel(openRouterId, retryMessages, {
    reasoning,
    timeoutMs: MODEL_TIMEOUT_MS,
  });

  return retryRaw;
}

/**
 * Streams a model call, accumulates the text, and validates it.
 * Falls back to a non-streaming retry if streaming fails or JSON is invalid.
 * Calls `onChunk` with each token as it arrives.
 */
async function streamModelAndCollect(
  openRouterId: string,
  messages: ChatMessage[],
  reasoning: ReasoningConfig,
  validateFn: (raw: string) => boolean,
  onChunk?: (chunk: string) => void
): Promise<string> {
  let accumulated = "";

  try {
    for await (const chunk of streamModel(openRouterId, messages, { reasoning, timeoutMs: MODEL_TIMEOUT_MS })) {
      accumulated += chunk;
      onChunk?.(chunk);
    }
  } catch {
    // Streaming failed — fall back to non-streaming
    return callModelWithJsonRetry(openRouterId, messages, reasoning, validateFn);
  }

  if (validateFn(accumulated)) return accumulated;

  // Streamed response was invalid JSON — retry once non-streaming
  const retryMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: accumulated },
    { role: "user", content: JSON_RETRY_MESSAGE },
  ];
  return callModel(openRouterId, retryMessages, { reasoning, timeoutMs: MODEL_TIMEOUT_MS });
}

function isValidIdeaJson(raw: string): boolean {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return !!(parsed.title && parsed.title !== "Untitled");
    }
  } catch { /* */ }
  return false;
}

function isValidCritiqueVoteJson(raw: string): boolean {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed.critiques) && parsed.critiques.length > 0
        && Array.isArray(parsed.rankings) && parsed.rankings.length > 0;
    }
  } catch { /* */ }
  return false;
}

function isValidFinalVoteJson(raw: string): boolean {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed.rankings) && parsed.rankings.length > 0;
    }
  } catch { /* */ }
  return false;
}

// --- Main benchmark runner ---

export async function* runBenchmark(
  categoryId: string,
  prompt: string,
  options?: { onToken?: (modelId: string, stage: string, chunk: string) => void }
): AsyncGenerator<BenchmarkProgress> {
  const { onToken } = options ?? {};
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

  // --- Step 1: Generate ideas (with live progress) ---
  run.status = "generating";
  yield { status: "generating", step: `Generating ideas from ${models.length} models...`, run: { ...run } };

  const generatePrompt = buildGeneratePrompt(category, prompt);
  const ideaCompletions: Idea[] = [];
  let ideaCount = 0;

  const ideaPromises = models.map(async (model) => {
    const raw = await streamModelAndCollect(
      model.openRouterId,
      [
        { role: "system", content: generatePrompt.system },
        { role: "user", content: generatePrompt.user },
      ],
      REASONING_GENERATE,
      isValidIdeaJson,
      onToken ? (chunk) => onToken(model.id, "generate", chunk) : undefined
    );
    const idea: Idea = {
      modelId: model.id,
      content: parseIdeaJson(raw),
      raw,
      timestamp: new Date().toISOString(),
    };
    ideaCompletions.push(idea);
    ideaCount++;
    return idea;
  });

  // Track completions for live progress
  const ideaProgressPromises = ideaPromises.map((p, i) =>
    p.then((idea) => ({ index: i, idea })).catch(() => ({ index: i, idea: null }))
  );

  // Yield progress as each model completes
  for (const progressPromise of ideaProgressPromises) {
    const result = await progressPromise;
    if (result.idea) {
      run.ideas = [...ideaCompletions];
      yield {
        status: "generating",
        step: `Generated idea ${ideaCount}/${models.length} (${getModelName(result.idea.modelId)})`,
        run: { ...run, ideas: [...ideaCompletions] },
      };
    }
  }

  // Wait for all to settle and collect final results
  const ideaResults = await Promise.allSettled(ideaPromises);
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

  // --- Step 2: Combined Critique + Vote (with shuffled order per judge) ---
  run.status = "critiquing";
  yield { status: "critiquing", step: `Models are critiquing and ranking ideas (0/${run.ideas.length})...`, run: { ...run } };

  const critiqueCompletions: CritiqueVoteResult[] = [];
  let critiqueCount = 0;

  const critiqueVotePromises = run.ideas.map(async (judgeIdea) => {
    const model = getModelById(judgeIdea.modelId);
    if (!model) throw new Error(`Model not found: ${judgeIdea.modelId}`);

    // Shuffle idea order for this specific judge to eliminate position bias
    const shuffledIdeas = shuffleArray(run.ideas, `critique_${judgeIdea.modelId}_${run.id}`);

    const { system, user } = buildCritiqueVotePrompt(
      shuffledIdeas,
      judgeIdea.modelId,
      category,
      prompt,
      anonymousMap
    );

    const raw = await callModelWithJsonRetry(
      model.openRouterId,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      REASONING_CRITIQUE,
      isValidCritiqueVoteJson
    );

    const { critiques, rankings } = parseCritiqueVoteJson(raw, anonymousMap);

    const result: CritiqueVoteResult = {
      fromModelId: judgeIdea.modelId,
      critiques,
      rankings,
    };
    critiqueCompletions.push(result);
    critiqueCount++;
    return result;
  });

  // Yield progress as each judge completes
  const critiqueProgressPromises = critiqueVotePromises.map((p, i) =>
    p.then((result) => ({ index: i, result })).catch(() => ({ index: i, result: null }))
  );

  for (const progressPromise of critiqueProgressPromises) {
    const res = await progressPromise;
    if (res.result) {
      run.critiqueVotes = [...critiqueCompletions];
      yield {
        status: "critiquing",
        step: `Critique complete ${critiqueCount}/${run.ideas.length} (${getModelName(res.result.fromModelId)})`,
        run: { ...run, critiqueVotes: [...critiqueCompletions] },
      };
    }
  }

  const critiqueVoteResults = await Promise.allSettled(critiqueVotePromises);
  run.critiqueVotes = critiqueVoteResults
    .filter((r): r is PromiseFulfilledResult<CritiqueVoteResult> => r.status === "fulfilled")
    .map((r) => r.value);

  await saveBenchmarkRun(run);

  // --- Step 3: Revise (with live progress) ---
  run.status = "revising";
  yield { status: "revising", step: `Models are revising their ideas (0/${run.ideas.length})...`, run: { ...run } };

  const revisionCompletions: Idea[] = [];
  let revisionCount = 0;

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

    const raw = await streamModelAndCollect(
      model.openRouterId,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      REASONING_REVISE,
      isValidIdeaJson,
      onToken ? (chunk) => onToken(idea.modelId, "revise", chunk) : undefined
    );

    const revised: Idea = {
      modelId: idea.modelId,
      content: parseIdeaJson(raw),
      raw,
      timestamp: new Date().toISOString(),
    };
    revisionCompletions.push(revised);
    revisionCount++;
    return revised;
  });

  const revisionProgressPromises = revisionPromises.map((p, i) =>
    p.then((result) => ({ index: i, result })).catch(() => ({ index: i, result: null }))
  );

  for (const progressPromise of revisionProgressPromises) {
    const res = await progressPromise;
    if (res.result) {
      run.revisedIdeas = [...revisionCompletions];
      yield {
        status: "revising",
        step: `Revised ${revisionCount}/${run.ideas.length} (${getModelName(res.result.modelId)})`,
        run: { ...run, revisedIdeas: [...revisionCompletions] },
      };
    }
  }

  const revisionResults = await Promise.allSettled(revisionPromises);
  run.revisedIdeas = revisionResults
    .filter((r): r is PromiseFulfilledResult<Idea> => r.status === "fulfilled")
    .map((r) => r.value);

  await saveBenchmarkRun(run);

  // --- Step 4: Final Voting (with shuffled order per judge + live progress) ---
  run.status = "voting";
  yield { status: "voting", step: `Final round of voting (0/${run.revisedIdeas.length})...`, run: { ...run } };

  // Re-map for revised ideas (same models, same labels for consistency)
  const revisedAnonymousMap = buildAnonymousMap(run.revisedIdeas.map((i) => i.modelId));

  const finalVoteCompletions: Ranking[] = [];
  let voteCount = 0;

  const finalVotePromises = run.revisedIdeas.map(async (judgeIdea) => {
    const model = getModelById(judgeIdea.modelId);
    if (!model) throw new Error(`Model not found: ${judgeIdea.modelId}`);

    // Shuffle idea order for this specific judge
    const shuffledRevised = shuffleArray(run.revisedIdeas, `vote_${judgeIdea.modelId}_${run.id}`);

    const { system, user } = buildFinalVotePrompt(
      shuffledRevised,
      category,
      prompt,
      revisedAnonymousMap
    );

    const raw = await callModelWithJsonRetry(
      model.openRouterId,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      REASONING_VOTE,
      isValidFinalVoteJson
    );

    const ranking: Ranking = {
      judgeModelId: judgeIdea.modelId,
      rankings: parseFinalVoteJson(raw, revisedAnonymousMap),
    };
    finalVoteCompletions.push(ranking);
    voteCount++;
    return ranking;
  });

  const voteProgressPromises = finalVotePromises.map((p, i) =>
    p.then((result) => ({ index: i, result })).catch(() => ({ index: i, result: null }))
  );

  for (const progressPromise of voteProgressPromises) {
    const res = await progressPromise;
    if (res.result) {
      run.finalRankings = [...finalVoteCompletions];
      yield {
        status: "voting",
        step: `Vote ${voteCount}/${run.revisedIdeas.length} (${getModelName(res.result.judgeModelId)})`,
        run: { ...run, finalRankings: [...finalVoteCompletions] },
      };
    }
  }

  const finalVoteResults = await Promise.allSettled(finalVotePromises);
  run.finalRankings = finalVoteResults
    .filter((r): r is PromiseFulfilledResult<Ranking> => r.status === "fulfilled")
    .map((r) => r.value);

  // --- Done ---
  run.status = "complete";
  await saveBenchmarkRun(run);

  yield { status: "complete", step: "Benchmark complete!", run: { ...run } };
}
