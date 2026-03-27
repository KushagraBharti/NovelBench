"use node";

import { Buffer } from "node:buffer";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { decryptSecret } from "./lib/crypto";
import {
  callOpenRouterTurnWithKey,
  callOpenRouterWithKey,
  estimateOpenRouterCostUsd,
  streamOpenRouterTurnWithKey,
  streamOpenRouterWithKey,
} from "./lib/openrouter";
import { searchWebWithExaKey } from "./lib/exa";
import { getCategoryById } from "@/lib/categories";
import {
  createStageWebTrace,
  dedupeSearchPayload,
  DEFAULT_WEB_SEARCH_CONFIG,
  formatPriorSourceSummary,
  normalizeSearchArgs,
  SEARCH_WEB_TOOL,
  sourceRecordFromResult,
  supportsToolCallingError,
  toolMessageContent,
} from "@/lib/benchmark-web";
import {
  buildCritiqueVotePrompt,
  buildFinalVotePrompt,
  buildGeneratePrompt,
  buildRevisionPrompt,
} from "@/lib/prompts";
import type { ChatMessage, ReasoningDetail } from "@/lib/openrouter";
import {
  normalizeCritiqueVoteResponse,
  normalizeFinalVoteResponse,
  normalizeIdeaContent,
} from "@/lib/structured-output";
import {
  REASONING_CRITIQUE,
  REASONING_GENERATE,
  REASONING_REVISE,
  REASONING_VOTE,
} from "@/lib/prompt-runtime";
import type { CritiqueEntry, Idea, StageWebTrace, WebEnabledStage } from "@/types";
import { LIVE_TOKEN_FLUSH_CHARS } from "@/lib/runtime-config";

const ANONYMOUS_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function buildAnonymousMap(modelIds: string[]) {
  const map = new Map<string, string>();
  modelIds.forEach((id, index) => map.set(id, ANONYMOUS_LABELS[index]));
  return map;
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

const stageActionResultValidator = v.object({
  kind: v.union(v.literal("success"), v.literal("failed")),
  modelId: v.string(),
  error: v.optional(v.string()),
});

type StageActionResult = {
  kind: "success" | "failed";
  modelId: string;
  error?: string;
};

type ExecutionBundle = {
  bundle: any;
  participant: any;
  category: NonNullable<ReturnType<typeof getCategoryById>>;
  apiKey: string;
  exaApiKey?: string;
  pricing?: {
    inputPerMillion?: number;
    outputPerMillion?: number;
  };
};

async function getExecutionBundle(
  ctx: ActionCtx,
  runId: string,
  participantId: string,
  bundleLoader:
    | typeof internal.runs.getGenerateBundleInternal
    | typeof internal.runs.getCritiqueBundleInternal
    | typeof internal.runs.getReviseBundleInternal
    | typeof internal.runs.getVoteBundleInternal,
): Promise<ExecutionBundle> {
  const bundle: any = await ctx.runQuery(bundleLoader, {
    runId: runId as never,
  });
  const participant = bundle.participants.find((entry: { _id: string }) => entry._id === participantId);
  if (!participant) {
    throw new Error("Participant not found");
  }
  if (!bundle.vaultEntry || bundle.vaultEntry.revokedAt) {
    throw new Error("OpenRouter API key is not configured");
  }
  const category = getCategoryById(bundle.run.categoryId);
  if (!category) {
    throw new Error(`Unknown category: ${bundle.run.categoryId}`);
  }

  const apiKey = decryptSecret(bundle.vaultEntry);
  const exaApiKey =
    bundle.policy?.researchEnabled && bundle.exaEntry && !bundle.exaEntry.revokedAt
      ? decryptSecret(bundle.exaEntry)
      : undefined;
  const pricing = bundle.run.selectedModels.find(
    (model: { id: string }) => model.id === participant.modelId,
  )?.pricing;

  return {
    bundle,
    participant,
    category,
    apiKey,
    exaApiKey,
    pricing,
  };
}

async function finalizeSuccess(
  ctx: ActionCtx,
  params: {
    runId: string;
    participantId: string;
    stage: "generate" | "critique" | "revise" | "vote";
    raw: string;
    parsedResult: unknown;
    startedAt: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    webTrace?: StageWebTrace;
  },
) {
  const completedAt = Date.now();
  const storageId = await ctx.storage.store(
    new Blob([params.raw], { type: "text/plain" }),
  );
  await ctx.runMutation(internal.runs.recordParticipantStageSuccessInternal, {
    runId: params.runId as never,
    participantId: params.participantId as never,
    stage: params.stage,
    completedAt,
    latencyMs: completedAt - params.startedAt,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    estimatedCostUsd: params.estimatedCostUsd,
    parsedResult: params.parsedResult,
    rawStorageId: storageId,
    rawSizeBytes: Buffer.byteLength(params.raw, "utf8"),
  });

  if (params.webTrace) {
    await ctx.runMutation(internal.runs.recordWebTraceInternal, {
      runId: params.runId as never,
      stage: params.webTrace.stage,
      participantModelId: params.webTrace.modelId,
      trace: params.webTrace,
      createdAt: completedAt,
    });
  }
}

async function finalizeFailure(
  ctx: ActionCtx,
  params: {
    runId: string;
    participantId: string;
    stage: "generate" | "critique" | "revise" | "vote";
    startedAt: number;
    error: Error;
    webTrace?: StageWebTrace;
  },
) {
  const completedAt = Date.now();

  if (params.webTrace) {
    await ctx.runMutation(internal.runs.recordWebTraceInternal, {
      runId: params.runId as never,
      stage: params.webTrace.stage,
      participantModelId: params.webTrace.modelId,
      trace: params.webTrace,
      createdAt: completedAt,
    });
  }

  await ctx.runMutation(internal.runs.recordParticipantStageFailureInternal, {
    runId: params.runId as never,
    participantId: params.participantId as never,
    stage: params.stage,
    completedAt,
    message: params.error.message,
    retryable: !params.error.message.toLowerCase().includes("not configured"),
  });
}

function sumUsage(
  current: { inputTokens: number; outputTokens: number },
  next: { inputTokens: number; outputTokens: number },
) {
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
  };
}

function hasWebTraceContent(trace: StageWebTrace) {
  return (
    trace.toolCalls.length > 0 ||
    trace.retrievedSources.length > 0 ||
    trace.usage.usedSearch ||
    !trace.usage.toolSupported ||
    Boolean(trace.usage.downgradedReason)
  );
}

function toReasoningDetailId(
  stage: "generate" | "revise",
  modelId: string,
  detail: ReasoningDetail,
  fallbackIndex: number,
) {
  return detail.id ?? `${stage}:${modelId}:${detail.type}:${detail.index ?? fallbackIndex}`;
}

function createChunkPublisher(
  ctx: ActionCtx,
  params: {
    runId: string;
    stage: "generate" | "revise";
    modelId: string;
  },
) {
  let buffer = "";

  return {
    push: async (chunk: string) => {
      buffer += chunk;
      if (buffer.length >= LIVE_TOKEN_FLUSH_CHARS || /[\n.!?]$/.test(chunk)) {
        const flushed = buffer;
        buffer = "";
        await ctx.runMutation(internal.runs.appendLiveTokenEventInternal, {
          runId: params.runId as never,
          stage: params.stage,
          participantModelId: params.modelId,
          chunk: flushed,
          createdAt: Date.now(),
        });
      }
    },
    flush: async () => {
      if (!buffer) return;
      const flushed = buffer;
      buffer = "";
      await ctx.runMutation(internal.runs.appendLiveTokenEventInternal, {
        runId: params.runId as never,
        stage: params.stage,
        participantModelId: params.modelId,
        chunk: flushed,
        createdAt: Date.now(),
      });
    },
  };
}

async function publishReasoningDetails(
  ctx: ActionCtx,
  params: {
    runId: string;
    stage: "generate" | "revise";
    modelId: string;
    turn?: number;
    details: ReasoningDetail[];
  },
) {
  if (params.details.length === 0) {
    return;
  }

  await ctx.runMutation(internal.runs.appendReasoningDetailsInternal, {
    runId: params.runId as never,
    stage: params.stage,
    participantModelId: params.modelId,
    turn: params.turn,
    details: params.details.map((detail, index) => ({
      detailId: toReasoningDetailId(params.stage, params.modelId, detail, index),
      detailType: detail.type,
      format: detail.format,
      index: detail.index ?? index,
      text: detail.text,
      summary: detail.summary,
      data: detail.data,
      signature: detail.signature ?? undefined,
    })),
    createdAt: Date.now(),
  });
}

function priorSourcesFromEvents(
  events: any[],
  modelId: string,
  stage: WebEnabledStage,
) {
  return events
    .filter((event) => event.kind === "web_stage_trace")
    .map((event) => event.payload as StageWebTrace)
    .filter((trace) => trace.modelId === modelId && trace.stage === stage)
    .flatMap((trace) => trace.retrievedSources);
}

function toolDowngradeReason(args: {
  policy: { researchEnabled?: boolean } | null | undefined;
  exaApiKey?: string;
}) {
  if (args.policy?.researchEnabled === false) {
    return "Research is disabled by project policy.";
  }
  if (!args.exaApiKey) {
    return "Exa API key is not configured for this workspace.";
  }
  return undefined;
}

async function storeSearchPayloadArtifact(
  ctx: ActionCtx,
  params: {
    runId: string;
    modelId: string;
    stage: WebEnabledStage;
    toolCallId: string;
    query: string;
    turn: number;
    payload: unknown;
  },
) {
  const content = JSON.stringify(params.payload, null, 2);
  const storageId = await ctx.storage.store(
    new Blob([content], { type: "application/json" }),
  );
  await ctx.runMutation(internal.runs.insertArtifactInternal, {
    runId: params.runId as never,
    participantModelId: params.modelId,
    stage: params.stage,
    artifactType: "exa.search_payload",
    label: `${params.modelId} ${params.stage} search payload`,
    storageId,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(content, "utf8"),
    metadata: {
      toolCallId: params.toolCallId,
      query: params.query,
      turn: params.turn,
    },
    createdAt: Date.now(),
  });
}

async function executeSearchToolCall(
  ctx: ActionCtx,
  trace: StageWebTrace,
  params: {
    runId: string;
    modelId: string;
    stage: WebEnabledStage;
    toolCall: {
      id: string;
      function: {
        name: string;
        arguments: string;
      };
    };
    turn: number;
    seenUrls: Set<string>;
    exaApiKey: string;
  },
): Promise<{ trace: StageWebTrace; toolMessage: ChatMessage }> {
  const stageCalls = trace.toolCalls.length;
  if (stageCalls >= DEFAULT_WEB_SEARCH_CONFIG.maxSearchCallsPerStagePerModel) {
    throw new Error(`search_web budget exhausted for ${params.stage}`);
  }

  if (params.toolCall.function.name !== "search_web") {
    throw new Error(`Unsupported tool: ${params.toolCall.function.name}`);
  }

  const args = normalizeSearchArgs(params.toolCall.function.arguments);
  const startedAt = new Date().toISOString();
  const record = {
    id: params.toolCall.id,
    modelId: params.modelId,
    stage: params.stage,
    toolName: "search_web" as const,
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

  await ctx.runMutation(internal.runs.appendToolCallEventInternal, {
    runId: params.runId as never,
    stage: params.stage,
    participantModelId: params.modelId,
    state: "started",
    toolName: "search_web",
    callId: params.toolCall.id,
    turn: params.turn,
    query: args.query,
    createdAt: Date.now(),
  });

  try {
    const payload = dedupeSearchPayload(
      await searchWebWithExaKey(params.exaApiKey, args, {
        defaultMaxResults: DEFAULT_WEB_SEARCH_CONFIG.maxResultsPerSearch,
        defaultMaxCharsPerResult: DEFAULT_WEB_SEARCH_CONFIG.maxCharsPerResult,
        maxResults: DEFAULT_WEB_SEARCH_CONFIG.maxResultsPerSearch,
        maxCharsPerResult: DEFAULT_WEB_SEARCH_CONFIG.maxCharsPerResult,
      }),
      params.seenUrls,
    );

    await storeSearchPayloadArtifact(ctx, {
      runId: params.runId,
      modelId: params.modelId,
      stage: params.stage,
      toolCallId: params.toolCall.id,
      query: payload.query,
      turn: params.turn,
      payload,
    });

    const completedAt = new Date().toISOString();
    const latencyMs = Date.parse(completedAt) - Date.parse(startedAt);
    const sources = payload.results.map((result) =>
      sourceRecordFromResult(
        params.runId,
        params.modelId,
        params.stage,
        payload.query,
        result,
        completedAt,
      ),
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
            }
          : entry,
      ),
      retrievedSources: [...trace.retrievedSources, ...sources],
      usage: {
        ...trace.usage,
        sourceCount: trace.usage.sourceCount + payload.results.length,
        totalLatencyMs: trace.usage.totalLatencyMs + latencyMs,
      },
    };

    await ctx.runMutation(internal.runs.appendToolCallEventInternal, {
      runId: params.runId as never,
      stage: params.stage,
      participantModelId: params.modelId,
      state: "completed",
      toolName: "search_web",
      callId: params.toolCall.id,
      turn: params.turn,
      query: payload.query,
      resultCount: payload.results.length,
      urls: payload.results.map((result) => result.url),
      createdAt: Date.now(),
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
          : entry,
      ),
      usage: {
        ...trace.usage,
        totalLatencyMs: trace.usage.totalLatencyMs + latencyMs,
      },
    };

    await ctx.runMutation(internal.runs.appendToolCallEventInternal, {
      runId: params.runId as never,
      stage: params.stage,
      participantModelId: params.modelId,
      state: "failed",
      toolName: "search_web",
      callId: params.toolCall.id,
      turn: params.turn,
      query: args.query,
      error: message,
      createdAt: Date.now(),
    });

    throw Object.assign(error instanceof Error ? error : new Error(message), {
      trace,
    });
  }
}

async function runIdeaStageWithOptionalWebSearch(
  ctx: ActionCtx,
  params: {
    runId: string;
    participant: any;
    apiKey: string;
    exaApiKey?: string;
    policy?: { researchEnabled?: boolean } | null;
    stage: WebEnabledStage;
    reasoning: typeof REASONING_GENERATE;
    toolMessages: ChatMessage[];
    fallbackMessages: ChatMessage[];
  },
) {
  let trace = createStageWebTrace(params.stage, params.participant.modelId);
  const chunkPublisher = createChunkPublisher(ctx, {
    runId: params.runId,
    stage: params.stage,
    modelId: params.participant.modelId,
  });
  const downgradeReason = toolDowngradeReason({
    policy: params.policy,
    exaApiKey: params.exaApiKey,
  });

  if (downgradeReason) {
    trace = {
      ...trace,
      usage: {
        ...trace.usage,
        toolSupported: false,
        downgradedReason: downgradeReason,
      },
    };
    const fallback = await streamOpenRouterWithKey({
      apiKey: params.apiKey,
      openRouterId: params.participant.openRouterId,
      messages: params.fallbackMessages,
      reasoning: params.reasoning,
      onContentChunk: (chunk) => chunkPublisher.push(chunk),
      onReasoningDetails: (details) =>
        publishReasoningDetails(ctx, {
          runId: params.runId,
          stage: params.stage,
          modelId: params.participant.modelId,
          details,
        }),
    });
    await chunkPublisher.flush();
    return {
      raw: fallback.raw,
      usage: fallback.usage,
      trace,
    };
  }

  const seenUrls = new Set<string>();
  const messages = [...params.toolMessages];
  let totalUsage = { inputTokens: 0, outputTokens: 0 };

  try {
    for (let turn = 0; turn < DEFAULT_WEB_SEARCH_CONFIG.maxLoopTurns; turn++) {
      const turnResult = await streamOpenRouterTurnWithKey({
        apiKey: params.apiKey,
        openRouterId: params.participant.openRouterId,
        messages,
        reasoning: params.reasoning,
        tools: [SEARCH_WEB_TOOL],
        toolChoice: "auto",
        parallelToolCalls: false,
        onContentChunk: (chunk) => chunkPublisher.push(chunk),
        onReasoningDetails: (details) =>
          publishReasoningDetails(ctx, {
            runId: params.runId,
            stage: params.stage,
            modelId: params.participant.modelId,
            turn,
            details,
          }),
      });
      totalUsage = sumUsage(totalUsage, turnResult.usage);

      messages.push({
        role: "assistant",
        content: turnResult.content,
        tool_calls: turnResult.toolCalls.length > 0 ? turnResult.toolCalls : undefined,
      });

      if (turnResult.toolCalls.length === 0) {
        await chunkPublisher.flush();
        return {
          raw: turnResult.content,
          usage: totalUsage,
          trace,
        };
      }

      for (const toolCall of turnResult.toolCalls) {
        try {
          const executed = await executeSearchToolCall(ctx, trace, {
            runId: params.runId,
            modelId: params.participant.modelId,
            stage: params.stage,
            toolCall,
            turn,
            seenUrls,
            exaApiKey: params.exaApiKey!,
          });
          trace = executed.trace;
          messages.push(executed.toolMessage);
        } catch (error) {
          if (supportsToolCallingError(error as Error)) {
            throw error;
          }

          const message = error instanceof Error ? error.message : String(error);
          const errorTrace = (error as { trace?: StageWebTrace }).trace;
          if (errorTrace) {
            trace = errorTrace;
          }
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: "search_web",
            content: JSON.stringify({ error: message }),
          });
        }
      }
    }
  } catch (error) {
    if (supportsToolCallingError(error as Error)) {
      trace = {
        ...trace,
        usage: {
          ...trace.usage,
          toolSupported: false,
          downgradedReason: (error as Error).message,
        },
      };
      const fallback = await streamOpenRouterWithKey({
        apiKey: params.apiKey,
        openRouterId: params.participant.openRouterId,
        messages: params.fallbackMessages,
        reasoning: params.reasoning,
        onContentChunk: (chunk) => chunkPublisher.push(chunk),
        onReasoningDetails: (details) =>
          publishReasoningDetails(ctx, {
            runId: params.runId,
            stage: params.stage,
            modelId: params.participant.modelId,
            details,
          }),
      });
      totalUsage = sumUsage(totalUsage, fallback.usage);
      await chunkPublisher.flush();
      return {
        raw: fallback.raw,
        usage: totalUsage,
        trace,
      };
    }
    throw error;
  }

  throw new Error(`search_web loop turn limit reached during ${params.stage}`);
}

export const generateParticipant = internalAction({
  args: {
    runId: v.id("runs"),
    participantId: v.id("runParticipants"),
  },
  returns: stageActionResultValidator,
  handler: async (ctx, args): Promise<StageActionResult> => {
    const startedAt = Date.now();
    let modelId = "";
    let trace: StageWebTrace | undefined;

    try {
      const { bundle, participant, category, apiKey, exaApiKey, pricing } = await getExecutionBundle(
        ctx,
        args.runId,
        args.participantId,
        internal.runs.getGenerateBundleInternal,
      );
      modelId = participant.modelId;
      if (bundle.run.cancellationRequested) {
        throw new Error("Run canceled");
      }

      await ctx.runMutation(internal.runs.markParticipantStartedInternal, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "generate",
        startedAt,
      });

      const toolPrompt = buildGeneratePrompt(category, bundle.run.prompt, {
        includeWebSearchInstructions: Boolean(bundle.policy?.researchEnabled && exaApiKey),
      });
      const fallbackPrompt = buildGeneratePrompt(category, bundle.run.prompt, {
        includeWebSearchInstructions: false,
      });
      const result = await runIdeaStageWithOptionalWebSearch(ctx, {
        runId: args.runId,
        participant,
        apiKey,
        exaApiKey,
        policy: bundle.policy,
        stage: "generate",
        reasoning: REASONING_GENERATE,
        toolMessages: [
          { role: "system", content: toolPrompt.system },
          { role: "user", content: toolPrompt.user },
        ],
        fallbackMessages: [
          { role: "system", content: fallbackPrompt.system },
          { role: "user", content: fallbackPrompt.user },
        ],
      });
      trace = result.trace;

      const parsedResult = normalizeIdeaContent(result.raw, category);
      const estimatedCostUsd = estimateOpenRouterCostUsd({
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        pricing,
      });
      await finalizeSuccess(ctx, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "generate",
        raw: result.raw,
        parsedResult,
        startedAt,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCostUsd,
        webTrace: hasWebTraceContent(trace) ? trace : undefined,
      });
      return { kind: "success", modelId: participant.modelId };
    } catch (error) {
      await finalizeFailure(ctx, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "generate",
        startedAt,
        error: error instanceof Error ? error : new Error(String(error)),
        webTrace: trace && hasWebTraceContent(trace) ? trace : undefined,
      });
      return {
        kind: "failed",
        modelId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const critiqueParticipant = internalAction({
  args: {
    runId: v.id("runs"),
    participantId: v.id("runParticipants"),
  },
  returns: stageActionResultValidator,
  handler: async (ctx, args): Promise<StageActionResult> => {
    const startedAt = Date.now();
    let modelId = "";

    try {
      const { bundle, participant, category, apiKey, pricing } = await getExecutionBundle(
        ctx,
        args.runId,
        args.participantId,
        internal.runs.getCritiqueBundleInternal,
      );
      modelId = participant.modelId;
      if (bundle.run.cancellationRequested) {
        throw new Error("Run canceled");
      }

      await ctx.runMutation(internal.runs.markParticipantStartedInternal, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "critique",
        startedAt,
      });

      const activeIdeas: Idea[] = bundle.participants
        .filter((entry: any) => entry.generatedIdea && entry.status !== "failed" && entry.status !== "canceled")
        .sort((a: any, b: any) => a.order - b.order)
        .map((entry: any) => ({
          modelId: entry.modelId,
          content: entry.generatedIdea,
          raw: "",
          timestamp: new Date(entry.completedAt ?? Date.now()).toISOString(),
        }));

      const anonymousMap = buildAnonymousMap(activeIdeas.map((idea) => idea.modelId));
      const shuffledIdeas = shuffleArray(activeIdeas, `critique:${participant.modelId}:${bundle.run._id}`);
      const prompt = buildCritiqueVotePrompt(
        shuffledIdeas,
        participant.modelId,
        category,
        bundle.run.prompt,
        anonymousMap,
      );
      const { raw, usage } = await callOpenRouterWithKey({
        apiKey,
        openRouterId: participant.openRouterId,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        reasoning: REASONING_CRITIQUE,
      });
      const parsed = normalizeCritiqueVoteResponse(raw, anonymousMap);
      const estimatedCostUsd = estimateOpenRouterCostUsd({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        pricing,
      });
      await finalizeSuccess(ctx, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "critique",
        raw,
        parsedResult: {
          fromModelId: participant.modelId,
          critiques: parsed.critiques,
          rankings: parsed.rankings,
        },
        startedAt,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd,
      });
      return { kind: "success", modelId: participant.modelId };
    } catch (error) {
      await finalizeFailure(ctx, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "critique",
        startedAt,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return {
        kind: "failed",
        modelId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const reviseParticipant = internalAction({
  args: {
    runId: v.id("runs"),
    participantId: v.id("runParticipants"),
  },
  returns: stageActionResultValidator,
  handler: async (ctx, args): Promise<StageActionResult> => {
    const startedAt = Date.now();
    let modelId = "";
    let trace: StageWebTrace | undefined;

    try {
      const { bundle, participant, category, apiKey, exaApiKey, pricing } = await getExecutionBundle(
        ctx,
        args.runId,
        args.participantId,
        internal.runs.getReviseBundleInternal,
      );
      modelId = participant.modelId;
      if (bundle.run.cancellationRequested) {
        throw new Error("Run canceled");
      }

      await ctx.runMutation(internal.runs.markParticipantStartedInternal, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "revise",
        startedAt,
      });

      const critiques: CritiqueEntry[] = [];
      for (const entry of bundle.participants as any[]) {
        const critiqueResult = entry.critiqueResult as { critiques?: CritiqueEntry[] } | undefined;
        for (const critique of critiqueResult?.critiques ?? []) {
          if (critique.targetModelId === participant.modelId) {
            critiques.push(critique);
          }
        }
      }
      for (const event of bundle.humanCritiqueEvents as any[]) {
        if (event.kind !== "human_critique_submitted") {
          continue;
        }
        const eventCritiques = (event.payload?.critiques ?? []) as CritiqueEntry[];
        for (const critique of eventCritiques) {
          if (critique.targetModelId === participant.modelId) {
            critiques.push(critique);
          }
        }
      }

      const originalIdea = {
        modelId: participant.modelId,
        content: participant.generatedIdea,
        raw: "",
        timestamp: new Date(participant.completedAt ?? Date.now()).toISOString(),
      };
      const priorSourceSummary = formatPriorSourceSummary(
        priorSourcesFromEvents(bundle.generateTraceEvents, participant.modelId, "generate"),
      );
      const toolPrompt = buildRevisionPrompt(
        originalIdea,
        critiques,
        category,
        bundle.run.prompt,
        {
          includeWebSearchInstructions: Boolean(bundle.policy?.researchEnabled && exaApiKey),
          priorSourceSummary,
        },
      );
      const fallbackPrompt = buildRevisionPrompt(
        originalIdea,
        critiques,
        category,
        bundle.run.prompt,
        {
          includeWebSearchInstructions: false,
          priorSourceSummary,
        },
      );
      const result = await runIdeaStageWithOptionalWebSearch(ctx, {
        runId: args.runId,
        participant,
        apiKey,
        exaApiKey,
        policy: bundle.policy,
        stage: "revise",
        reasoning: REASONING_REVISE,
        toolMessages: [
          { role: "system", content: toolPrompt.system },
          { role: "user", content: toolPrompt.user },
        ],
        fallbackMessages: [
          { role: "system", content: fallbackPrompt.system },
          { role: "user", content: fallbackPrompt.user },
        ],
      });
      trace = result.trace;

      const parsedResult = normalizeIdeaContent(result.raw, category);
      const estimatedCostUsd = estimateOpenRouterCostUsd({
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        pricing,
      });
      await finalizeSuccess(ctx, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "revise",
        raw: result.raw,
        parsedResult,
        startedAt,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCostUsd,
        webTrace: hasWebTraceContent(trace) ? trace : undefined,
      });
      return { kind: "success", modelId: participant.modelId };
    } catch (error) {
      await finalizeFailure(ctx, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "revise",
        startedAt,
        error: error instanceof Error ? error : new Error(String(error)),
        webTrace: trace && hasWebTraceContent(trace) ? trace : undefined,
      });
      return {
        kind: "failed",
        modelId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const voteParticipant = internalAction({
  args: {
    runId: v.id("runs"),
    participantId: v.id("runParticipants"),
  },
  returns: stageActionResultValidator,
  handler: async (ctx, args): Promise<StageActionResult> => {
    const startedAt = Date.now();
    let modelId = "";

    try {
      const { bundle, participant, category, apiKey, pricing } = await getExecutionBundle(
        ctx,
        args.runId,
        args.participantId,
        internal.runs.getVoteBundleInternal,
      );
      modelId = participant.modelId;
      if (bundle.run.cancellationRequested) {
        throw new Error("Run canceled");
      }

      await ctx.runMutation(internal.runs.markParticipantStartedInternal, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "vote",
        startedAt,
      });

      const revisedIdeas: Idea[] = bundle.participants
        .filter((entry: any) => entry.revisedIdea && entry.status !== "failed" && entry.status !== "canceled")
        .sort((a: any, b: any) => a.order - b.order)
        .map((entry: any) => ({
          modelId: entry.modelId,
          content: entry.revisedIdea,
          raw: "",
          timestamp: new Date(entry.completedAt ?? Date.now()).toISOString(),
        }));

      const anonymousMap = buildAnonymousMap(revisedIdeas.map((idea) => idea.modelId));
      const shuffledIdeas = shuffleArray(revisedIdeas, `vote:${participant.modelId}:${bundle.run._id}`);
      const prompt = buildFinalVotePrompt(
        shuffledIdeas,
        category,
        bundle.run.prompt,
        anonymousMap,
      );
      const { raw, usage } = await callOpenRouterWithKey({
        apiKey,
        openRouterId: participant.openRouterId,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        reasoning: REASONING_VOTE,
      });
      const rankings = normalizeFinalVoteResponse(raw, anonymousMap);
      const estimatedCostUsd = estimateOpenRouterCostUsd({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        pricing,
      });
      await finalizeSuccess(ctx, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "vote",
        raw,
        parsedResult: {
          judgeModelId: participant.modelId,
          rankings,
        },
        startedAt,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd,
      });
      return { kind: "success", modelId: participant.modelId };
    } catch (error) {
      await finalizeFailure(ctx, {
        runId: args.runId,
        participantId: args.participantId,
        stage: "vote",
        startedAt,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return {
        kind: "failed",
        modelId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
