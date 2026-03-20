import {
  BenchmarkProgress,
  BenchmarkRun,
  CritiqueEntry,
  CritiqueVoteResult,
  Idea,
  IdeaContent,
  Ranking,
  RankingEntry,
  RetrievedSourceRecord,
  RunCheckpointStage,
  RunFailureRecord,
  SearchWebArgs,
  ToolCallRecord,
  WebEnabledStage,
} from "@/types";
import {
  callModel,
  callModelTurn,
  ChatMessage,
  ChatToolCall,
  ChatToolDefinition,
  ReasoningConfig,
  streamModel,
} from "./openrouter";
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
import { appendPromptCapture, PromptCaptureStage } from "./prompt-capture";
import {
  formatPriorSourceSummary,
  searchWebWithExa,
  SearchWebPayload,
  sourceRecordFromResult,
} from "./web-search";

const ANONYMOUS_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const SEARCH_WEB_TOOL: ChatToolDefinition = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "Search the live web for information that could materially improve the current idea. Returns the top 3 results with metadata, snippets, and bounded full-text previews.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The exact search query to run.",
        },
        include_domains: {
          type: "array",
          items: { type: "string" },
          description: "Optional domains to prefer or restrict to.",
        },
        exclude_domains: {
          type: "array",
          items: { type: "string" },
          description: "Optional domains to exclude.",
        },
        freshness_days: {
          type: "number",
          description: "Optional recency filter in days.",
        },
        category_hint: {
          type: "string",
          enum: ["general", "news", "research", "company", "financial"],
          description: "Optional hint to shape the search.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

interface JsonRetryOptions {
  retryOnInvalidJson?: boolean;
  acceptPartialResponse?: boolean;
  onBeforeRequest?: (requestBody: Record<string, unknown>, attempt: "initial" | "retry") => Promise<void> | void;
}

export interface BenchmarkRuntimeControls {
  createAbortController: (key: string) => AbortController;
  releaseAbortController: (key: string) => void;
  isCancellationRequested: () => Promise<boolean>;
}

function supportsToolCallingError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("tool") ||
    message.includes("function call") ||
    message.includes("tool_choice") ||
    message.includes("parallel_tool_calls")
  );
}

function normalizeSearchArgs(rawArgs: string): SearchWebArgs {
  const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
  const toStringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value)
      ? value.map((entry) => String(entry).trim()).filter(Boolean)
      : undefined;

  return {
    query: String(parsed.query ?? "").trim(),
    includeDomains: toStringArray(parsed.include_domains ?? parsed.includeDomains),
    excludeDomains: toStringArray(parsed.exclude_domains ?? parsed.excludeDomains),
    freshnessDays:
      typeof parsed.freshness_days === "number"
        ? parsed.freshness_days
        : typeof parsed.freshnessDays === "number"
          ? parsed.freshnessDays
          : undefined,
    categoryHint:
      typeof parsed.category_hint === "string"
        ? (parsed.category_hint as SearchWebArgs["categoryHint"])
        : typeof parsed.categoryHint === "string"
          ? (parsed.categoryHint as SearchWebArgs["categoryHint"])
          : undefined,
  };
}

function dedupeSearchPayload(
  payload: SearchWebPayload,
  seenUrls: Set<string>
): SearchWebPayload {
  const deduped = payload.results.filter((result) => {
    if (seenUrls.has(result.url)) return false;
    seenUrls.add(result.url);
    return true;
  });

  return {
    query: payload.query,
    results: deduped,
  };
}

function toolMessageContent(payload: SearchWebPayload): string {
  return JSON.stringify(payload);
}

function createEmptyUsage(stage: WebEnabledStage, modelId: string) {
  return {
    stage,
    modelId,
    toolSupported: true,
    downgradedReason: undefined as string | undefined,
    usedSearch: false,
    searchCalls: 0,
    searchQueries: [] as string[],
    sourceCount: 0,
    totalLatencyMs: 0,
  };
}

type StageToolTrace = {
  toolCalls: ToolCallRecord[];
  retrievedSources: RetrievedSourceRecord[];
  usage: ReturnType<typeof createEmptyUsage>;
};

function createStageToolTrace(stage: WebEnabledStage, modelId: string): StageToolTrace {
  return {
    toolCalls: [],
    retrievedSources: [],
    usage: createEmptyUsage(stage, modelId),
  };
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
      const hasCritiques = Array.isArray(parsed.critiques) && parsed.critiques.length > 0;
      const hasLegacyRankings = Array.isArray(parsed.rankings) && parsed.rankings.length > 0;
      const hasInlineRankings =
        hasCritiques &&
        parsed.critiques.every(
          (critique: Record<string, unknown>) =>
            critique &&
            typeof critique === "object" &&
            typeof critique.ideaLabel === "string" &&
            Number.isFinite(Number(critique.ranking))
        );
      return (
        hasCritiques &&
        (hasLegacyRankings || hasInlineRankings)
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
  const { retryOnInvalidJson = true, onBeforeRequest } = options;
  const raw = await callModel(openRouterId, messages, {
    reasoning,
    timeoutMs: MODEL_TIMEOUT_MS,
    signal,
    onBeforeRequest: (requestBody) => onBeforeRequest?.(requestBody, "initial"),
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
      onBeforeRequest: (requestBody) => onBeforeRequest?.(requestBody, "retry"),
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
  const { acceptPartialResponse = false, retryOnInvalidJson = true, onBeforeRequest } = options;
  let accumulated = "";

  try {
    for await (const chunk of streamModel(openRouterId, messages, {
      reasoning,
      timeoutMs: MODEL_TIMEOUT_MS,
      signal,
      onBeforeRequest: (requestBody) => onBeforeRequest?.(requestBody, "initial"),
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
      onBeforeRequest,
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
      onBeforeRequest: (requestBody) => onBeforeRequest?.(requestBody, "retry"),
    }
  );
}

function createPromptCaptureLogger(
  runId: string,
  stage: PromptCaptureStage,
  modelId: string,
  openRouterId: string,
  reasoning: ReasoningConfig,
  stream: boolean,
  messages: ChatMessage[]
) {
  return async (requestBody: Record<string, unknown>, attempt: "initial" | "retry") => {
    await appendPromptCapture({
      runId,
      stage,
      modelId,
      openRouterId,
      timestamp: new Date().toISOString(),
      attempt,
      stream,
      reasoning,
      messages,
      requestBody,
    });
  };
}

async function appendDynamicPromptCapture(
  runId: string,
  stage: PromptCaptureStage,
  modelId: string,
  openRouterId: string,
  reasoning: ReasoningConfig,
  stream: boolean,
  attempt: "initial" | "retry",
  messages: ChatMessage[],
  requestBody: Record<string, unknown>
) {
  await appendPromptCapture({
    runId,
    stage,
    modelId,
    openRouterId,
    timestamp: new Date().toISOString(),
    attempt,
    stream,
    reasoning,
    messages,
    requestBody,
  });
}

async function executeSearchToolCall(
  trace: StageToolTrace,
  params: {
    runId: string;
    modelId: string;
    stage: WebEnabledStage;
    toolCall: ChatToolCall;
    turn: number;
    stageStartMs: number;
    seenUrls: Set<string>;
    config: BenchmarkRun["web"]["config"];
    signal?: AbortSignal;
  }
): Promise<{ trace: StageToolTrace; toolMessage: ChatMessage }> {
  const stageCalls = trace.toolCalls.length;
  if (stageCalls >= params.config.maxSearchCallsPerStagePerModel) {
    throw new Error(`search_web budget exhausted for ${params.stage}`);
  }

  if (Date.now() - params.stageStartMs > params.config.totalStageBudgetMs) {
    throw new Error(`search_web time budget exhausted for ${params.stage}`);
  }

  if (params.toolCall.function.name !== "search_web") {
    throw new Error(`Unsupported tool: ${params.toolCall.function.name}`);
  }

  const args = normalizeSearchArgs(params.toolCall.function.arguments);
  const startedAt = new Date().toISOString();
  const record: ToolCallRecord = {
    id: params.toolCall.id,
    modelId: params.modelId,
    stage: params.stage,
    toolName: "search_web",
    startedAt,
    args,
    turn: params.turn,
  };

  trace = {
    ...trace,
    toolCalls: [...trace.toolCalls, record],
    usage: {
      ...trace.usage,
      usedSearch: true,
      searchCalls: trace.usage.searchCalls + 1,
      searchQueries: [...trace.usage.searchQueries, args.query],
    },
  };

  getRunEventBus().publishToolActivity(params.runId, {
    modelId: params.modelId,
    stage: params.stage,
    toolName: "search_web",
    state: "started",
    callId: params.toolCall.id,
    query: args.query,
  });

  try {
    const payload = dedupeSearchPayload(
      await searchWebWithExa(args, {
        signal: params.signal,
        timeoutMs: params.config.perCallTimeoutMs,
        maxResults: params.config.maxResultsPerSearch,
        maxCharsPerResult: params.config.maxCharsPerResult,
      }),
      params.seenUrls
    );

    const completedAt = new Date().toISOString();
    const latencyMs = Date.parse(completedAt) - Date.parse(startedAt);
    const sources = payload.results.map((result) =>
      sourceRecordFromResult(params.runId, params.modelId, params.stage, payload.query, result)
    );
    trace = {
      ...trace,
      toolCalls: trace.toolCalls.map((entry) =>
        entry.id === record.id
          ? {
              ...record,
              completedAt,
              latencyMs,
              resultSummary: {
                query: payload.query,
                resultCount: payload.results.length,
                urls: payload.results.map((result) => result.url),
              },
              resultPayload: payload,
            }
          : entry
      ),
      retrievedSources: [...trace.retrievedSources, ...sources],
      usage: {
        ...trace.usage,
        sourceCount: trace.usage.sourceCount + payload.results.length,
        totalLatencyMs: trace.usage.totalLatencyMs + latencyMs,
      },
    };

    getRunEventBus().publishToolActivity(params.runId, {
      modelId: params.modelId,
      stage: params.stage,
      toolName: "search_web",
      state: "completed",
      callId: params.toolCall.id,
      query: payload.query,
      resultCount: payload.results.length,
      urls: payload.results.map((result) => result.url),
    });

    return {
      trace,
      toolMessage: {
        role: "tool",
        tool_call_id: params.toolCall.id,
        name: "search_web",
        content: toolMessageContent(payload),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completedAt = new Date().toISOString();
    const latencyMs = Date.parse(completedAt) - Date.parse(startedAt);
    trace = {
      ...trace,
      toolCalls: trace.toolCalls.map((entry) =>
        entry.id === record.id
          ? {
              ...record,
              completedAt,
              latencyMs,
              error: message,
            }
          : entry
      ),
      usage: {
        ...trace.usage,
        totalLatencyMs: trace.usage.totalLatencyMs + latencyMs,
      },
    };

    getRunEventBus().publishToolActivity(params.runId, {
      modelId: params.modelId,
      stage: params.stage,
      toolName: "search_web",
      state: "failed",
      callId: params.toolCall.id,
      query: args.query,
      error: message,
    });
    throw error;
  }
}

async function runToolEnabledIdeaStage(
  current: BenchmarkRun,
  params: {
    stage: WebEnabledStage;
    modelId: string;
    openRouterId: string;
    reasoning: ReasoningConfig;
    initialMessages: ChatMessage[];
    signal?: AbortSignal;
    onChunk?: (chunk: string) => void;
  }
): Promise<{ raw: string; trace: StageToolTrace }> {
  const messages = [...params.initialMessages];
  const seenUrls = new Set<string>();
  const stageStartMs = Date.now();
  const config = current.web.config;
  let trace = createStageToolTrace(params.stage, params.modelId);

  if (current.selectedModels.find((model) => model.id === params.modelId)?.supportsToolCalling === false) {
    const raw = await streamModelAndCollect(
      params.openRouterId,
      messages,
      params.reasoning,
      isValidIdeaJson,
      params.signal,
      params.onChunk,
      {
        acceptPartialResponse: true,
        retryOnInvalidJson: false,
        onBeforeRequest: (requestBody, attempt) =>
          appendDynamicPromptCapture(
            current.id,
            params.stage,
            params.modelId,
            params.openRouterId,
            params.reasoning,
            true,
            attempt,
            messages,
            requestBody
          ),
      }
    );
    trace.usage.toolSupported = false;
    trace.usage.downgradedReason = "Model catalog marked as tool-unsupported.";
    return { raw, trace };
  }

  for (let turn = 0; turn < config.maxLoopTurns; turn++) {
    if (Date.now() - stageStartMs > config.totalStageBudgetMs) {
      break;
    }

    try {
      const turnResult = await callModelTurn(params.openRouterId, messages, {
        reasoning: params.reasoning,
        timeoutMs: MODEL_TIMEOUT_MS,
        signal: params.signal,
        tools: [SEARCH_WEB_TOOL],
        toolChoice: "auto",
        parallelToolCalls: false,
        onBeforeRequest: (requestBody) =>
          appendDynamicPromptCapture(
            current.id,
            params.stage,
            params.modelId,
            params.openRouterId,
            params.reasoning,
            false,
            "initial",
            messages,
            requestBody
          ),
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: turnResult.content,
        tool_calls: turnResult.toolCalls.length > 0 ? turnResult.toolCalls : undefined,
      };
      messages.push(assistantMessage);

      if (turnResult.toolCalls.length === 0) {
        if (turnResult.content && params.onChunk) {
          params.onChunk(turnResult.content);
        }
        return { raw: turnResult.content, trace };
      }

      for (const toolCall of turnResult.toolCalls) {
        try {
          const executed = await executeSearchToolCall(trace, {
            runId: current.id,
            modelId: params.modelId,
            stage: params.stage,
            toolCall,
            turn,
            stageStartMs,
            seenUrls,
            config,
            signal: params.signal,
          });
          trace = executed.trace;
          messages.push(executed.toolMessage);
        } catch (error) {
          if (supportsToolCallingError(error as Error)) {
            throw error;
          }

          const message = error instanceof Error ? error.message : String(error);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: "search_web",
            content: JSON.stringify({ error: message }),
          });
        }
      }
    } catch (error) {
      if (supportsToolCallingError(error as Error)) {
        trace.usage.toolSupported = false;
        trace.usage.downgradedReason = (error as Error).message;
        const fallbackRaw = await streamModelAndCollect(
          params.openRouterId,
          params.initialMessages,
          params.reasoning,
          isValidIdeaJson,
          params.signal,
          params.onChunk,
          {
            acceptPartialResponse: true,
            retryOnInvalidJson: false,
            onBeforeRequest: (requestBody, attempt) =>
              appendDynamicPromptCapture(
                current.id,
                params.stage,
                params.modelId,
                params.openRouterId,
                params.reasoning,
                true,
                attempt,
                params.initialMessages,
                requestBody
              ),
          }
        );
        return { raw: fallbackRaw, trace };
      }
      throw error;
    }
  }

  throw new Error(`Tool loop exceeded limit during ${params.stage}`);
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

function mergeStageToolTrace(run: BenchmarkRun, trace: StageToolTrace): BenchmarkRun {
  return {
    ...run,
    web: {
      ...run.web,
      toolCalls: [
        ...run.web.toolCalls.filter(
          (entry) => !(entry.stage === trace.usage.stage && entry.modelId === trace.usage.modelId)
        ),
        ...trace.toolCalls,
      ],
      retrievedSources: [
        ...run.web.retrievedSources.filter(
          (entry) => !(entry.stage === trace.usage.stage && entry.modelId === trace.usage.modelId)
        ),
        ...trace.retrievedSources,
      ],
      usage: [
        ...run.web.usage.filter(
          (entry) => !(entry.stage === trace.usage.stage && entry.modelId === trace.usage.modelId)
        ),
        trace.usage,
      ],
    },
  };
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
  const pendingModels = current.selectedModels.filter(
    (model) =>
      !current.ideas.some((idea) => idea.modelId === model.id) &&
      !current.failedModels.includes(model.id)
  );

  const tasks = pendingModels.map(async (model) => {
    const abortController = controls.createAbortController(`generate:${model.id}`);
    try {
      const generatePrompt = buildGeneratePrompt(category, current.prompt, {
        includeWebSearchInstructions: true,
      });
      const messages: ChatMessage[] = [
        { role: "system", content: generatePrompt.system },
        { role: "user", content: generatePrompt.user },
      ];
      const { raw, trace } = await runToolEnabledIdeaStage(current, {
        stage: "generate",
        modelId: model.id,
        openRouterId: model.openRouterId,
        reasoning: REASONING_GENERATE,
        initialMessages: messages,
        signal: abortController.signal,
        onChunk: (chunk) => getRunEventBus().publishToken(current.id, model.id, "generate", chunk),
      });
      const idea: Idea = {
        modelId: model.id,
        content: parseIdeaJson(raw, category),
        raw,
        timestamp: new Date().toISOString(),
      };
      return { modelId: model.id, idea, trace };
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
      const { modelId, idea, trace } = result.value;
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
      current = mergeStageToolTrace(current, trace);
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
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    try {
      const raw = await callModelWithJsonRetry(
        model.openRouterId,
        messages,
        REASONING_CRITIQUE,
        isValidCritiqueVoteJson,
        abortController.signal,
        {
          onBeforeRequest: createPromptCaptureLogger(
            current.id,
            "critique",
            judgeIdea.modelId,
            model.openRouterId,
            REASONING_CRITIQUE,
            false,
            messages
          ),
        }
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

    const priorSourceSummary = formatPriorSourceSummary(
      current.web.retrievedSources
        .filter((source) => source.stage === "generate" && source.modelId === idea.modelId)
        .slice(0, current.web.config.maxResultsPerSearch * current.web.config.maxSearchCallsPerStagePerModel)
    );
    const { system, user } = buildRevisionPrompt(idea, critiquesForIdea, category, current.prompt, {
      includeWebSearchInstructions: true,
      priorSourceSummary,
    });
    const abortController = controls.createAbortController(`revise:${idea.modelId}`);
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    try {
      const { raw, trace } = await runToolEnabledIdeaStage(current, {
        stage: "revise",
        modelId: idea.modelId,
        openRouterId: model.openRouterId,
        reasoning: REASONING_REVISE,
        initialMessages: messages,
        signal: abortController.signal,
        onChunk: (chunk) => getRunEventBus().publishToken(current.id, idea.modelId, "revise", chunk),
      });
      return {
        modelId: idea.modelId,
        idea: {
          modelId: idea.modelId,
          content: parseIdeaJson(raw, category),
          raw,
          timestamp: new Date().toISOString(),
        } as Idea,
        trace,
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
      const { modelId, idea, trace } = result.value;
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
      current = mergeStageToolTrace(current, trace);
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
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    try {
      const raw = await callModelWithJsonRetry(
        model.openRouterId,
        messages,
        REASONING_VOTE,
        isValidFinalVoteJson,
        abortController.signal,
        {
          onBeforeRequest: createPromptCaptureLogger(
            current.id,
            "vote",
            judgeIdea.modelId,
            model.openRouterId,
            REASONING_VOTE,
            false,
            messages
          ),
        }
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
