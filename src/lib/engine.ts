import {
  BenchmarkProgress,
  BenchmarkRun,
  CritiqueEntry,
  CritiqueVoteResult,
  Idea,
  IdeaContent,
  Ranking,
  RankingEntry,
  RunCheckpointStage,
  RunFailureRecord,
} from "@/types";
import { callModel, ChatMessage, ReasoningConfig, streamModel } from "./openrouter";
import { getModelName } from "./models";
import { getCategoryById } from "./categories";
import {
  buildCritiqueVotePrompt,
  buildFinalVotePrompt,
  buildGeneratePrompt,
  buildRevisionPrompt,
} from "./prompts";
import {
  createCheckpointForStage,
  getBenchmarkRepository,
  loadBenchmarkRun,
} from "./storage";
import { getOpenRouterCircuitBreaker } from "./circuit-breaker";
import { getRunEventBus } from "./run-events";
import { inCompletionOrder } from "./async";
import {
  isUsableIdeaResponse,
  normalizeCritiqueVoteResponse,
  normalizeFinalVoteResponse,
  normalizeIdeaContent,
} from "./structured-output";
import {
  JSON_RETRY_MESSAGE,
  MODEL_TIMEOUT_MS,
  REASONING_CRITIQUE,
  REASONING_GENERATE,
  REASONING_REVISE,
  REASONING_VOTE,
} from "./prompt-runtime";

const ANONYMOUS_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

interface JsonRetryOptions {
  retryOnInvalidJson?: boolean;
  acceptPartialResponse?: boolean;
}

export interface BenchmarkRuntimeControls {
  createAbortController: (key: string) => AbortController;
  releaseAbortController: (key: string) => void;
  isCancellationRequested: () => Promise<boolean>;
}

function buildAnonymousMap(modelIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  modelIds.forEach((id, index) => map.set(id, ANONYMOUS_LABELS[index]));
  return map;
}

function sortByModelOrder<T extends { modelId: string }>(
  entries: T[],
  modelOrder: string[]
): T[] {
  const positions = new Map(modelOrder.map((modelId, index) => [modelId, index]));
  return [...entries].sort(
    (a, b) => (positions.get(a.modelId) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.modelId) ?? Number.MAX_SAFE_INTEGER)
  );
}

function shuffleArray<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
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

function parseIdeaJson(raw: string, category = getCategoryById("venture")): IdeaContent {
  return normalizeIdeaContent(raw, category);
}

function parseCritiqueVoteJson(
  raw: string,
  anonymousMap: Map<string, string>
): { critiques: CritiqueEntry[]; rankings: RankingEntry[] } {
  return normalizeCritiqueVoteResponse(raw, anonymousMap);
}

function parseFinalVoteJson(raw: string, anonymousMap: Map<string, string>): RankingEntry[] {
  const parsed = normalizeFinalVoteResponse(raw, anonymousMap);
  if (parsed.length > 0) return parsed.map((entry) => ({ ...entry, score: clampScore(entry.score) }));

  return [...anonymousMap.keys()].map((modelId, index) => ({
    modelId,
    rank: index + 1,
    score: 5,
    reasoning: "Could not parse ranking",
  }));
}

function clampScore(score: number): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 5;
  return Math.max(1, Math.min(10, Math.round(score)));
}

function isValidIdeaJson(raw: string): boolean {
  return isUsableIdeaResponse(raw);
}

function isValidCritiqueVoteJson(raw: string): boolean {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return (
        Array.isArray(parsed.critiques) &&
        parsed.critiques.length > 0 &&
        Array.isArray(parsed.rankings) &&
        parsed.rankings.length > 0
      );
    }
  } catch {
    // Ignore.
  }
  return false;
}

function isValidFinalVoteJson(raw: string): boolean {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed.rankings) && parsed.rankings.length > 0;
    }
  } catch {
    // Ignore.
  }
  return false;
}

async function callModelWithJsonRetry(
  openRouterId: string,
  messages: ChatMessage[],
  reasoning: ReasoningConfig,
  validateFn: (raw: string) => boolean,
  signal?: AbortSignal,
  options: JsonRetryOptions = {}
): Promise<string> {
  const { retryOnInvalidJson = true } = options;
  const raw = await callModel(openRouterId, messages, {
    reasoning,
    timeoutMs: MODEL_TIMEOUT_MS,
    signal,
  });

  if (validateFn(raw) || !retryOnInvalidJson) return raw;

  return callModel(
    openRouterId,
    [
      ...messages,
      { role: "assistant", content: raw },
      { role: "user", content: JSON_RETRY_MESSAGE },
    ],
    {
      reasoning,
      timeoutMs: MODEL_TIMEOUT_MS,
      signal,
    }
  );
}

async function streamModelAndCollect(
  openRouterId: string,
  messages: ChatMessage[],
  reasoning: ReasoningConfig,
  validateFn: (raw: string) => boolean,
  signal?: AbortSignal,
  onChunk?: (chunk: string) => void,
  options: JsonRetryOptions = {}
): Promise<string> {
  const { acceptPartialResponse = false, retryOnInvalidJson = true } = options;
  let accumulated = "";

  try {
    for await (const chunk of streamModel(openRouterId, messages, {
      reasoning,
      timeoutMs: MODEL_TIMEOUT_MS,
      signal,
    })) {
      accumulated += chunk;
      onChunk?.(chunk);
    }
  } catch {
    if (acceptPartialResponse && accumulated.trim().length > 0) {
      return accumulated;
    }
    return callModelWithJsonRetry(openRouterId, messages, reasoning, validateFn, signal, {
      retryOnInvalidJson,
    });
  }

  if (validateFn(accumulated)) return accumulated;
  if (acceptPartialResponse && accumulated.trim().length > 0) {
    return accumulated;
  }
  if (!retryOnInvalidJson) return accumulated;

  return callModel(
    openRouterId,
    [
      ...messages,
      { role: "assistant", content: accumulated },
      { role: "user", content: JSON_RETRY_MESSAGE },
    ],
    {
      reasoning,
      timeoutMs: MODEL_TIMEOUT_MS,
      signal,
    }
  );
}

function createFailure(
  stage: RunCheckpointStage,
  message: string,
  retryable: boolean,
  modelId?: string
): RunFailureRecord {
  return {
    id: `failure_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    stage,
    modelId,
    message,
    retryable,
    timestamp: new Date().toISOString(),
  };
}

function activeCompetitorIds(run: BenchmarkRun): string[] {
  return run.selectedModels
    .map((model) => model.id)
    .filter((modelId) => !run.failedModels.includes(modelId));
}

function shouldStopForLowQuorum(run: BenchmarkRun, candidateCount: number): boolean {
  return candidateCount < run.metadata.minimumSuccessfulModels;
}

async function persistRun(run: BenchmarkRun) {
  await getBenchmarkRepository().saveRun(run);
  getRunEventBus().setSnapshot(run);
}

async function persistAndPublish(run: BenchmarkRun, status: BenchmarkRun["status"], step: string) {
  const next: BenchmarkRun = {
    ...run,
    status,
    currentStep: step,
    updatedAt: new Date().toISOString(),
    circuitBreaker: getOpenRouterCircuitBreaker().snapshot(),
  };
  await persistRun(next);
  const progress: BenchmarkProgress = {
    status,
    step,
    run: next,
  };
  getRunEventBus().publishProgress(progress);
  return next;
}

async function failModel(
  run: BenchmarkRun,
  modelId: string,
  stage: RunCheckpointStage,
  error: Error
): Promise<BenchmarkRun> {
  const failures = run.failures.some((failure) => failure.modelId === modelId && failure.stage === stage)
    ? run.failures
    : [...run.failures, createFailure(stage, error.message, true, modelId)];

  const next: BenchmarkRun = {
    ...run,
    failedModels: run.failedModels.includes(modelId) ? run.failedModels : [...run.failedModels, modelId],
    failures,
    modelStates: {
      ...run.modelStates,
      [modelId]: {
        ...run.modelStates[modelId],
        status: "failed",
        stage,
        error: error.message,
        completedAt: new Date().toISOString(),
      },
    },
  };
  await persistRun(next);
  return next;
}

async function checkCancellation(run: BenchmarkRun, controls: BenchmarkRuntimeControls): Promise<BenchmarkRun | null> {
  if (!(await controls.isCancellationRequested())) return null;
  const next: BenchmarkRun = {
    ...run,
    status: run.ideas.length > 0 || run.revisedIdeas.length > 0 ? "partial" : "canceled",
    currentStep: "Run canceled",
    cancellation: {
      ...run.cancellation,
      requested: true,
      requestedAt: run.cancellation.requestedAt ?? new Date().toISOString(),
      reason: run.cancellation.reason ?? "Canceled by user",
    },
  };
  await persistAndPublish(next, next.status, next.currentStep);
  return next;
}

async function runGenerateStage(
  run: BenchmarkRun,
  controls: BenchmarkRuntimeControls
): Promise<BenchmarkRun> {
  const category = getCategoryById(run.categoryId);
  if (!category) throw new Error(`Unknown category: ${run.categoryId}`);

  let current = await persistAndPublish(run, "generating", `Generating ideas from ${run.selectedModels.length} models...`);
  const generatePrompt = buildGeneratePrompt(category, current.prompt);
  const pendingModels = current.selectedModels.filter(
    (model) =>
      !current.ideas.some((idea) => idea.modelId === model.id) &&
      !current.failedModels.includes(model.id)
  );

  const tasks = pendingModels.map(async (model) => {
    const abortController = controls.createAbortController(`generate:${model.id}`);
    try {
      const raw = await streamModelAndCollect(
        model.openRouterId,
        [
          { role: "system", content: generatePrompt.system },
          { role: "user", content: generatePrompt.user },
        ],
        REASONING_GENERATE,
        isValidIdeaJson,
        abortController.signal,
        (chunk) => getRunEventBus().publishToken(current.id, model.id, "generate", chunk),
        { acceptPartialResponse: true, retryOnInvalidJson: false }
      );
      const idea: Idea = {
        modelId: model.id,
        content: parseIdeaJson(raw, category),
        raw,
        timestamp: new Date().toISOString(),
      };
      return { modelId: model.id, idea };
    } finally {
      controls.releaseAbortController(`generate:${model.id}`);
    }
  });

  let completed = current.ideas.map((idea) => idea.modelId);

  for await (const result of inCompletionOrder(tasks)) {
    current = (await loadBenchmarkRun(current.id)) ?? current;
    const canceled = await checkCancellation(current, controls);
    if (canceled) return canceled;

    if (result.value) {
      const { modelId, idea } = result.value;
      current = {
        ...current,
        ideas: sortByModelOrder(
          [...current.ideas.filter((entry) => entry.modelId !== modelId), idea],
          current.selectedModels.map((model) => model.id)
        ),
        modelStates: {
          ...current.modelStates,
          [modelId]: {
            ...current.modelStates[modelId],
            status: "complete",
            stage: "generate",
            completedAt: new Date().toISOString(),
          },
        },
      };
      completed = [...new Set([...completed, modelId])];
      current.checkpoint = createCheckpointForStage("generate", completed);
      current = await persistAndPublish(
        current,
        "generating",
        `Generated idea ${current.ideas.length}/${current.selectedModels.length} (${getModelName(modelId)})`
      );
      continue;
    }

    const modelId = pendingModels[result.index]?.id;
    if (!modelId || !result.error) continue;
    current = await failModel(current, modelId, "generate", result.error);
    current = await persistAndPublish(
      current,
      "generating",
      `${getModelName(modelId)} failed during generation`
    );
  }

  const survivingIdeas = current.ideas.filter((idea) => !current.failedModels.includes(idea.modelId));
  if (shouldStopForLowQuorum(current, survivingIdeas.length)) {
    const status: BenchmarkRun["status"] = survivingIdeas.length === 0 ? "dead_lettered" : "partial";
    current = {
      ...current,
      error: "Too few models responded to continue.",
      failures: [...current.failures, createFailure("generate", "Too few models responded to continue.", false)],
      checkpoint: createCheckpointForStage("generate", survivingIdeas.map((idea) => idea.modelId)),
    };
    return persistAndPublish(current, status, current.error ?? "Too few models responded to continue.");
  }

  current.checkpoint = createCheckpointForStage("critique", survivingIdeas.map((idea) => idea.modelId));
  await persistRun(current);
  return current;
}

async function runCritiqueStage(
  run: BenchmarkRun,
  controls: BenchmarkRuntimeControls
): Promise<BenchmarkRun> {
  const category = getCategoryById(run.categoryId);
  if (!category) throw new Error(`Unknown category: ${run.categoryId}`);

  let current = await persistAndPublish(
    run,
    "critiquing",
    `Models are critiquing and ranking ideas (${run.critiqueVotes.length}/${activeCompetitorIds(run).length})...`
  );

  const activeIdeas = sortByModelOrder(
    current.ideas.filter((idea) => !current.failedModels.includes(idea.modelId)),
    current.selectedModels.map((model) => model.id)
  );
  const anonymousMap = buildAnonymousMap(activeIdeas.map((idea) => idea.modelId));
  const judges = activeIdeas.filter(
    (idea) => !current.critiqueVotes.some((vote) => vote.fromModelId === idea.modelId)
  );

  const tasks = judges.map(async (judgeIdea) => {
    const model = current.selectedModels.find((entry) => entry.id === judgeIdea.modelId);
    if (!model) throw new Error(`Model not found: ${judgeIdea.modelId}`);

    const shuffledIdeas = shuffleArray(activeIdeas, `critique_${judgeIdea.modelId}_${current.id}`);
    const { system, user } = buildCritiqueVotePrompt(
      shuffledIdeas,
      judgeIdea.modelId,
      category,
      current.prompt,
      anonymousMap
    );
    const abortController = controls.createAbortController(`critique:${judgeIdea.modelId}`);
    try {
      const raw = await callModelWithJsonRetry(
        model.openRouterId,
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        REASONING_CRITIQUE,
        isValidCritiqueVoteJson,
        abortController.signal
      );
      const parsed = parseCritiqueVoteJson(raw, anonymousMap);
      return {
        modelId: judgeIdea.modelId,
        vote: {
          fromModelId: judgeIdea.modelId,
          critiques: parsed.critiques.filter((entry) => !current.failedModels.includes(entry.targetModelId)),
          rankings: parsed.rankings.filter((entry) => !current.failedModels.includes(entry.modelId)),
        } as CritiqueVoteResult,
      };
    } finally {
      controls.releaseAbortController(`critique:${judgeIdea.modelId}`);
    }
  });

  let completed = current.critiqueVotes.map((vote) => vote.fromModelId);

  for await (const result of inCompletionOrder(tasks)) {
    current = (await loadBenchmarkRun(current.id)) ?? current;
    const canceled = await checkCancellation(current, controls);
    if (canceled) return canceled;

    if (result.value) {
      const { modelId, vote } = result.value;
      current = {
        ...current,
        critiqueVotes: [
          ...current.critiqueVotes.filter((entry) => entry.fromModelId !== modelId),
          vote,
        ],
        modelStates: {
          ...current.modelStates,
          [modelId]: {
            ...current.modelStates[modelId],
            status: "complete",
            stage: "critique",
            completedAt: new Date().toISOString(),
          },
        },
      };
      completed = [...new Set([...completed, modelId])];
      current.checkpoint = createCheckpointForStage("critique", completed);
      current = await persistAndPublish(
        current,
        "critiquing",
        `Critique complete ${current.critiqueVotes.length}/${activeIdeas.length} (${getModelName(modelId)})`
      );
      continue;
    }

    const modelId = judges[result.index]?.modelId;
    if (!modelId || !result.error) continue;
    current = await failModel(current, modelId, "critique", result.error);
    current = await persistAndPublish(current, "critiquing", `${getModelName(modelId)} failed during critique`);
  }

  const survivingModels = activeCompetitorIds(current).filter((modelId) =>
    current.ideas.some((idea) => idea.modelId === modelId)
  );
  if (shouldStopForLowQuorum(current, survivingModels.length)) {
    current = {
      ...current,
      error: "Too few models remained after critique.",
      failures: [...current.failures, createFailure("critique", "Too few models remained after critique.", false)],
    };
    return persistAndPublish(current, "partial", current.error ?? "Too few models remained after critique.");
  }

  current.checkpoint = createCheckpointForStage("human_critique", survivingModels, survivingModels);
  current.status = "awaiting_human_critique";
  current.currentStep = "Optional human critique ready";
  await persistRun(current);
  return persistAndPublish(current, "awaiting_human_critique", "Review critiques or proceed to revision");
}

async function runRevisionStage(
  run: BenchmarkRun,
  controls: BenchmarkRuntimeControls
): Promise<BenchmarkRun> {
  const category = getCategoryById(run.categoryId);
  if (!category) throw new Error(`Unknown category: ${run.categoryId}`);

  let current = await persistAndPublish(
    run,
    "revising",
    `Models are revising ideas (${run.revisedIdeas.length}/${activeCompetitorIds(run).length})...`
  );

  const activeIdeas = current.ideas.filter((idea) => !current.failedModels.includes(idea.modelId));
  const pendingIdeas = activeIdeas.filter(
    (idea) => !current.revisedIdeas.some((revised) => revised.modelId === idea.modelId)
  );

  const tasks = pendingIdeas.map(async (idea) => {
    const model = current.selectedModels.find((entry) => entry.id === idea.modelId);
    if (!model) throw new Error(`Model not found: ${idea.modelId}`);

    const critiquesForIdea: CritiqueEntry[] = [];
    for (const vote of current.critiqueVotes) {
      for (const critique of vote.critiques) {
        if (critique.targetModelId === idea.modelId) critiquesForIdea.push(critique);
      }
    }
    for (const critique of current.humanCritiques) {
      if (critique.targetModelId === idea.modelId) critiquesForIdea.push(critique);
    }

    const { system, user } = buildRevisionPrompt(idea, critiquesForIdea, category, current.prompt);
    const abortController = controls.createAbortController(`revise:${idea.modelId}`);
    try {
      const raw = await streamModelAndCollect(
        model.openRouterId,
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        REASONING_REVISE,
        isValidIdeaJson,
        abortController.signal,
        (chunk) => getRunEventBus().publishToken(current.id, idea.modelId, "revise", chunk),
        { acceptPartialResponse: true, retryOnInvalidJson: false }
      );
      return {
        modelId: idea.modelId,
        idea: {
          modelId: idea.modelId,
          content: parseIdeaJson(raw, category),
          raw,
          timestamp: new Date().toISOString(),
        } as Idea,
      };
    } finally {
      controls.releaseAbortController(`revise:${idea.modelId}`);
    }
  });

  let completed = current.revisedIdeas.map((idea) => idea.modelId);

  for await (const result of inCompletionOrder(tasks)) {
    current = (await loadBenchmarkRun(current.id)) ?? current;
    const canceled = await checkCancellation(current, controls);
    if (canceled) return canceled;

    if (result.value) {
      const { modelId, idea } = result.value;
      current = {
        ...current,
        revisedIdeas: sortByModelOrder(
          [...current.revisedIdeas.filter((entry) => entry.modelId !== modelId), idea],
          current.selectedModels.map((model) => model.id)
        ),
        modelStates: {
          ...current.modelStates,
          [modelId]: {
            ...current.modelStates[modelId],
            status: "complete",
            stage: "revise",
            completedAt: new Date().toISOString(),
          },
        },
      };
      completed = [...new Set([...completed, modelId])];
      current.checkpoint = createCheckpointForStage("revise", completed);
      current = await persistAndPublish(
        current,
        "revising",
        `Revised ${current.revisedIdeas.length}/${activeIdeas.length} (${getModelName(modelId)})`
      );
      continue;
    }

    const modelId = pendingIdeas[result.index]?.modelId;
    if (!modelId || !result.error) continue;
    current = await failModel(current, modelId, "revise", result.error);
    current = await persistAndPublish(current, "revising", `${getModelName(modelId)} failed during revision`);
  }

  const survivingRevisions = current.revisedIdeas.filter((idea) => !current.failedModels.includes(idea.modelId));
  if (shouldStopForLowQuorum(current, survivingRevisions.length)) {
    current = {
      ...current,
      error: "Too few revised ideas remained for final voting.",
      failures: [...current.failures, createFailure("revise", "Too few revised ideas remained for final voting.", false)],
    };
    return persistAndPublish(current, "partial", current.error ?? "Too few revised ideas remained for final voting.");
  }

  current.checkpoint = createCheckpointForStage("vote", survivingRevisions.map((idea) => idea.modelId));
  await persistRun(current);
  return current;
}

async function runVotingStage(
  run: BenchmarkRun,
  controls: BenchmarkRuntimeControls
): Promise<BenchmarkRun> {
  const category = getCategoryById(run.categoryId);
  if (!category) throw new Error(`Unknown category: ${run.categoryId}`);

  let current = await persistAndPublish(
    run,
    "voting",
    `Final round of voting (${run.finalRankings.length}/${run.revisedIdeas.length})...`
  );

  const revisedIdeas = sortByModelOrder(
    current.revisedIdeas.filter((idea) => !current.failedModels.includes(idea.modelId)),
    current.selectedModels.map((model) => model.id)
  );
  const anonymousMap = buildAnonymousMap(revisedIdeas.map((idea) => idea.modelId));
  const judges = revisedIdeas.filter(
    (idea) => !current.finalRankings.some((ranking) => ranking.judgeModelId === idea.modelId)
  );

  const tasks = judges.map(async (judgeIdea) => {
    const model = current.selectedModels.find((entry) => entry.id === judgeIdea.modelId);
    if (!model) throw new Error(`Model not found: ${judgeIdea.modelId}`);

    const shuffledIdeas = shuffleArray(revisedIdeas, `vote_${judgeIdea.modelId}_${current.id}`);
    const { system, user } = buildFinalVotePrompt(
      shuffledIdeas,
      category,
      current.prompt,
      anonymousMap
    );
    const abortController = controls.createAbortController(`vote:${judgeIdea.modelId}`);
    try {
      const raw = await callModelWithJsonRetry(
        model.openRouterId,
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        REASONING_VOTE,
        isValidFinalVoteJson,
        abortController.signal
      );
      return {
        modelId: judgeIdea.modelId,
        ranking: {
          judgeModelId: judgeIdea.modelId,
          rankings: parseFinalVoteJson(raw, anonymousMap),
        } as Ranking,
      };
    } finally {
      controls.releaseAbortController(`vote:${judgeIdea.modelId}`);
    }
  });

  let completed = current.finalRankings.map((ranking) => ranking.judgeModelId);

  for await (const result of inCompletionOrder(tasks)) {
    current = (await loadBenchmarkRun(current.id)) ?? current;
    const canceled = await checkCancellation(current, controls);
    if (canceled) return canceled;

    if (result.value) {
      const { modelId, ranking } = result.value;
      current = {
        ...current,
        finalRankings: [
          ...current.finalRankings.filter((entry) => entry.judgeModelId !== modelId),
          ranking,
        ],
        modelStates: {
          ...current.modelStates,
          [modelId]: {
            ...current.modelStates[modelId],
            status: "complete",
            stage: "vote",
            completedAt: new Date().toISOString(),
          },
        },
      };
      completed = [...new Set([...completed, modelId])];
      current.checkpoint = createCheckpointForStage("vote", completed);
      current = await persistAndPublish(
        current,
        "voting",
        `Vote ${current.finalRankings.length}/${revisedIdeas.length} (${getModelName(modelId)})`
      );
      continue;
    }

    const modelId = judges[result.index]?.modelId;
    if (!modelId || !result.error) continue;
    current = await failModel(current, modelId, "vote", result.error);
    current = await persistAndPublish(current, "voting", `${getModelName(modelId)} failed during final vote`);
  }

  const finalJudgeCount = current.finalRankings.length;
  if (shouldStopForLowQuorum(current, finalJudgeCount)) {
    current = {
      ...current,
      error: "Too few final votes were completed.",
      failures: [...current.failures, createFailure("vote", "Too few final votes were completed.", false)],
    };
    return persistAndPublish(current, "partial", current.error ?? "Too few final votes were completed.");
  }

  current.checkpoint = createCheckpointForStage("complete", revisedIdeas.map((idea) => idea.modelId));
  await persistRun(current);
  return persistAndPublish(current, "complete", "Benchmark complete!");
}

export async function executeBenchmarkRun(
  runId: string,
  controls: BenchmarkRuntimeControls
): Promise<BenchmarkRun> {
  const run = await loadBenchmarkRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);

  let current = run;

  try {
    if (current.status === "complete" || current.status === "canceled") {
      return current;
    }

    if (current.checkpoint.stage === "generate") {
      current = await runGenerateStage(current, controls);
      if (["complete", "partial", "canceled", "dead_lettered", "error"].includes(current.status)) {
        return current;
      }
    }

    if (current.checkpoint.stage === "critique") {
      current = await runCritiqueStage(current, controls);
      if (current.status === "awaiting_human_critique") {
        return current;
      }
      if (["partial", "canceled", "dead_lettered", "error"].includes(current.status)) {
        return current;
      }
    }

    if (current.checkpoint.stage === "human_critique") {
      if (current.status === "awaiting_human_critique") {
        return current;
      }
      current = {
        ...current,
        checkpoint: createCheckpointForStage(
          "revise",
          current.checkpoint.completedModelIds,
          current.checkpoint.readyForRevisionModelIds
        ),
      };
      await persistRun(current);
    }

    if (current.checkpoint.stage === "revise") {
      current = await runRevisionStage(current, controls);
      if (["partial", "canceled", "dead_lettered", "error"].includes(current.status)) {
        return current;
      }
    }

    if (current.checkpoint.stage === "vote") {
      current = await runVotingStage(current, controls);
    }

    return current;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown benchmark error";
    const next: BenchmarkRun = {
      ...current,
      status: message.includes("circuit breaker") ? "dead_lettered" : "error",
      error: message,
      failures: [...current.failures, createFailure(current.checkpoint.stage, message, true)],
      circuitBreaker: getOpenRouterCircuitBreaker().snapshot(),
    };
    await persistAndPublish(next, next.status, message);
    return next;
  }
}
