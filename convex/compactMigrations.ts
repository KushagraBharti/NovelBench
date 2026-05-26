import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { runDocsToBenchmarkRun, type CompactRunDocs } from "./lib/runHelpers";
import type { HumanCritiqueEntry, ReasoningDetailRecord, StageWebTrace } from "@/types";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 50;
const DELETE_BATCH_SIZE = 50;

const TERMINAL_RUN_STATUSES = ["complete", "partial", "canceled", "dead_lettered", "error"] as const;
const TERMINAL_JOB_STATUSES = ["complete", "failed", "canceled", "dead_lettered"] as const;
const CHECKPOINT_STAGES = ["generate", "critique", "human_critique", "revise", "vote", "complete"] as const;
const RAW_ARTIFACT_TYPES = ["openrouter.raw", "exa.search_payload", "prompt_capture.jsonl"] as const;
const EXPORT_ARTIFACT_TYPES = ["export.json", "export.csv"] as const;

const CONTROL_KIND_TO_ACTION = {
  run_paused: "pause",
  run_resumed: "resume",
  run_canceled: "cancel",
  run_restarted: "restart",
  run_retried: "retry",
  human_critique_proceeded: "proceed",
} as const;

const DURABLE_EVENT_KINDS = [
  "human_critique_submitted",
  "web_stage_trace",
  "model_failed",
  "run_failed",
  "run_paused",
  "run_resumed",
  "run_canceled",
  "run_restarted",
  "run_retried",
  "human_critique_proceeded",
  "reasoning_detail",
] as const;

function batchSize(value?: number) {
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value ?? DEFAULT_BATCH_SIZE)));
}

function isWebStage(stage: string): stage is "generate" | "revise" {
  return stage === "generate" || stage === "revise";
}

function terminalRunStatus(value: string | undefined) {
  return (TERMINAL_RUN_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as (typeof TERMINAL_RUN_STATUSES)[number])
    : TERMINAL_RUN_STATUSES[0];
}

function nextTerminalRunStatus(status: (typeof TERMINAL_RUN_STATUSES)[number]) {
  const index = TERMINAL_RUN_STATUSES.indexOf(status);
  return TERMINAL_RUN_STATUSES[index + 1] ?? null;
}

function terminalJobStatus(value: string | undefined) {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as (typeof TERMINAL_JOB_STATUSES)[number])
    : TERMINAL_JOB_STATUSES[0];
}

function nextTerminalJobStatus(status: (typeof TERMINAL_JOB_STATUSES)[number]) {
  const index = TERMINAL_JOB_STATUSES.indexOf(status);
  return TERMINAL_JOB_STATUSES[index + 1] ?? null;
}

function appendOptionalText(existing?: string, next?: string) {
  const value = `${existing ?? ""}${next ?? ""}`;
  return value || undefined;
}

async function sourceEventExists(
  ctx: MutationCtx,
  table: "runSources" | "runFailures" | "runControlEvents",
  sourceEventId: string,
) {
  return await ctx.db.query(table).withIndex("by_source_event_id", (q) => q.eq("sourceEventId", sourceEventId)).first();
}

async function loadCompactRunDocs(ctx: QueryCtx | MutationCtx, runId: Id<"runs">): Promise<CompactRunDocs> {
  const [humanCritiques, sources, failures, controls, reasoningSummaries] = await Promise.all([
    ctx.db.query("runHumanCritiques").withIndex("by_run_and_created_at", (q) => q.eq("runId", runId)).collect(),
    ctx.db.query("runSources").withIndex("by_run_and_created_at", (q) => q.eq("runId", runId)).collect(),
    ctx.db.query("runFailures").withIndex("by_run_and_created_at", (q) => q.eq("runId", runId)).collect(),
    ctx.db.query("runControlEvents").withIndex("by_run_and_created_at", (q) => q.eq("runId", runId)).collect(),
    ctx.db.query("runReasoningSummaries").withIndex("by_run", (q) => q.eq("runId", runId)).collect(),
  ]);
  return { humanCritiques, sources, failures, controls, reasoningSummaries };
}

async function loadDurableEvents(ctx: QueryCtx | MutationCtx, runId: Id<"runs">) {
  const events = (
    await Promise.all(
      DURABLE_EVENT_KINDS.map((kind) =>
        ctx.db
          .query("runEvents")
          .withIndex("by_run_kind_and_created_at", (q) => q.eq("runId", runId).eq("kind", kind))
          .collect(),
      ),
    )
  ).flat();
  return events.sort((a, b) => a.createdAt - b.createdAt);
}

async function upsertReasoningSummary(
  ctx: MutationCtx,
  args: {
    event: Doc<"runEvents">;
    detail: {
      detailId?: string;
      detailType: ReasoningDetailRecord["type"];
      format?: string;
      index?: number;
      text?: string;
      summary?: string;
      data?: string;
      signature?: string | null;
      turn?: number;
    };
  },
) {
  if (!args.event.participantModelId || !isWebStage(args.event.stage)) {
    return false;
  }
  const detailId =
    args.detail.detailId ??
    `${args.event.stage}:${args.event.participantModelId}:${args.detail.detailType}:${args.detail.index ?? 0}`;
  const existing = await ctx.db
    .query("runReasoningSummaries")
    .withIndex("by_run_participant_model_id_and_detail_id", (q) =>
      q
        .eq("runId", args.event.runId)
        .eq("participantModelId", args.event.participantModelId!)
        .eq("detailId", detailId),
    )
    .first();
  const next = {
    stage: args.event.stage,
    participantModelId: args.event.participantModelId,
    detailId,
    detailType: args.detail.detailType,
    turn: args.detail.turn ?? existing?.turn,
    format: args.detail.format ?? existing?.format,
    index: args.detail.index ?? existing?.index,
    text: appendOptionalText(existing?.text, args.detail.text),
    summary: appendOptionalText(existing?.summary, args.detail.summary),
    data: appendOptionalText(existing?.data, args.detail.data),
    signature: args.detail.signature ?? existing?.signature,
    updatedAt: args.event.createdAt,
    sourceEventId: String(args.event._id),
  };
  if (existing) {
    await ctx.db.patch(existing._id, next);
    return false;
  }
  await ctx.db.insert("runReasoningSummaries", {
    runId: args.event.runId,
    ...next,
  });
  return true;
}

async function backfillEvent(ctx: MutationCtx, event: Doc<"runEvents">, dryRun: boolean) {
  const sourceEventId = String(event._id);

  if (event.kind === "human_critique_submitted") {
    const critiques = (event.payload as { critiques?: HumanCritiqueEntry[] } | undefined)?.critiques ?? [];
    let inserted = 0;
    for (const [index, critique] of critiques.entries()) {
      const existing = await ctx.db
        .query("runHumanCritiques")
        .withIndex("by_source_event_id_and_source_index", (q) =>
          q.eq("sourceEventId", sourceEventId).eq("sourceIndex", index),
        )
        .first();
      if (existing) continue;
      inserted += 1;
      if (dryRun) continue;
      await ctx.db.insert("runHumanCritiques", {
        runId: event.runId,
        targetModelId: critique.targetModelId,
        critiqueId: critique.id || `${sourceEventId}:${index}`,
        ideaLabel: critique.ideaLabel,
        strengths: critique.strengths,
        weaknesses: critique.weaknesses,
        suggestions: critique.suggestions,
        score: critique.score,
        authorLabel: critique.authorLabel,
        createdAt: Date.parse(critique.timestamp) || event.createdAt,
        sourceEventId,
        sourceIndex: index,
      });
    }
    return inserted;
  }

  if (event.kind === "web_stage_trace") {
    if (await sourceEventExists(ctx, "runSources", sourceEventId)) return 0;
    const trace = event.payload as StageWebTrace | undefined;
    if (!trace || !isWebStage(trace.stage) || !trace.modelId || !trace.usage) return 0;
    if (!dryRun) {
      await ctx.db.insert("runSources", {
        runId: event.runId,
        stage: trace.stage,
        participantModelId: trace.modelId,
        toolCalls: trace.toolCalls ?? [],
        retrievedSources: trace.retrievedSources ?? [],
        usage: trace.usage,
        createdAt: event.createdAt,
        sourceEventId,
      });
    }
    return 1;
  }

  if (event.kind === "model_failed" || event.kind === "run_failed") {
    if (await sourceEventExists(ctx, "runFailures", sourceEventId)) return 0;
    if (!dryRun) {
      await ctx.db.insert("runFailures", {
        runId: event.runId,
        stage: event.stage,
        participantModelId: event.participantModelId,
        message: event.message,
        retryable: Boolean((event.payload as { retryable?: boolean } | undefined)?.retryable),
        createdAt: event.createdAt,
        sourceEventId,
      });
    }
    return 1;
  }

  if (event.kind in CONTROL_KIND_TO_ACTION) {
    if (await sourceEventExists(ctx, "runControlEvents", sourceEventId)) return 0;
    if (!dryRun) {
      await ctx.db.insert("runControlEvents", {
        runId: event.runId,
        stage: event.stage,
        action: CONTROL_KIND_TO_ACTION[event.kind as keyof typeof CONTROL_KIND_TO_ACTION],
        scope: event.participantModelId ? "model" : "run",
        actor: "user",
        participantModelId: event.participantModelId,
        reason: event.message,
        createdAt: event.createdAt,
        sourceEventId,
      });
    }
    return 1;
  }

  if (event.kind === "reasoning_detail" && event.payload) {
    if (!event.participantModelId || !isWebStage(event.stage)) return 0;
    const payload = event.payload as {
      batch?: boolean;
      turn?: number;
      details?: Array<{
        detailId?: string;
        detailType: ReasoningDetailRecord["type"];
        format?: string;
        index?: number;
        text?: string;
        summary?: string;
        data?: string;
        signature?: string | null;
      }>;
      detailId?: string;
      detailType?: ReasoningDetailRecord["type"];
      format?: string;
      index?: number;
      text?: string;
      summary?: string;
      data?: string;
      signature?: string | null;
    };
    const details = payload.batch
      ? (payload.details ?? []).map((detail) => ({ ...detail, turn: payload.turn }))
      : payload.detailType
        ? [
            {
              detailId: payload.detailId,
              detailType: payload.detailType,
              format: payload.format,
              index: payload.index,
              text: payload.text,
              summary: payload.summary,
              data: payload.data,
              signature: payload.signature,
              turn: payload.turn,
            },
          ]
        : [];
    let inserted = 0;
    if (dryRun) return details.length;
    for (const detail of details) {
      inserted += (await upsertReasoningSummary(ctx, { event, detail })) ? 1 : 0;
    }
    return inserted;
  }

  return 0;
}

export const backfillCompactRunEventsInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    inserted: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("runEvents").order("asc").paginate({
      numItems: batchSize(args.batchSize),
      cursor: args.cursor ?? null,
    });
    let inserted = 0;
    for (const event of page.page) {
      inserted += await backfillEvent(ctx, event, Boolean(args.dryRun));
    }
    if (!args.dryRun && !page.isDone) {
      await ctx.scheduler.runAfter(0, internal.compactMigrations.backfillCompactRunEventsInternal, {
        cursor: page.continueCursor,
        batchSize: args.batchSize,
      });
    }
    return {
      processed: page.page.length,
      inserted,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function verifyRun(ctx: QueryCtx | MutationCtx, run: Doc<"runs">) {
  const [participants, events, compact] = await Promise.all([
    ctx.db.query("runParticipants").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
    loadDurableEvents(ctx, run._id),
    loadCompactRunDocs(ctx, run._id),
  ]);
  const oldRun = runDocsToBenchmarkRun({ run, participants, events });
  const newRun = runDocsToBenchmarkRun({ run, participants, events: [], compact });
  const hasHumanCritiqueEvents = events.some((event) => event.kind === "human_critique_submitted");
  const hasFailureEvents = events.some((event) => event.kind === "model_failed" || event.kind === "run_failed");
  const hasControlEvents = events.some((event) => event.kind in CONTROL_KIND_TO_ACTION);
  const hasWebEvents = events.some((event) => event.kind === "web_stage_trace");
  const hasReasoningEvents = events.some((event) => event.kind === "reasoning_detail");
  const checks = {
    humanCritiques: !hasHumanCritiqueEvents || sameJson(oldRun.humanCritiques, newRun.humanCritiques),
    failures: !hasFailureEvents || sameJson(oldRun.failures, newRun.failures),
    controls: !hasControlEvents || sameJson(oldRun.controls.history, newRun.controls.history),
    web: !hasWebEvents || sameJson(oldRun.web, newRun.web),
    reasoning: !hasReasoningEvents || sameJson(oldRun.reasoning, newRun.reasoning),
  };
  return {
    runId: run._id,
    ok: Object.values(checks).every(Boolean),
    checks,
  };
}

export const verifyCompactRunDataBatchInternal = internalQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("runs").order("asc").paginate({
      numItems: Math.min(10, batchSize(args.batchSize)),
      cursor: args.cursor ?? null,
    });
    const results = [];
    for (const run of page.page) {
      results.push(await verifyRun(ctx, run));
    }
    return {
      checked: results.length,
      ok: results.every((result) => result.ok),
      mismatches: results.filter((result) => !result.ok),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const deleteRunEventsForVerifiedRunInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    dryRun: v.optional(v.boolean()),
    verified: v.optional(v.boolean()),
  },
  returns: v.object({
    deleted: v.number(),
    remaining: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    if (!["complete", "partial", "canceled", "dead_lettered", "error"].includes(run.status)) {
      throw new ConvexError("Only terminal run events can be deleted");
    }
    if (!args.verified) {
      const verification = await verifyRun(ctx, run);
      if (!verification.ok) {
        throw new ConvexError("Compact verification failed; refusing to delete runEvents");
      }
    }
    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", args.runId))
      .take(DELETE_BATCH_SIZE);
    if (!args.dryRun) {
      for (const event of events) {
        await ctx.db.delete(event._id);
      }
      if (events.length === DELETE_BATCH_SIZE) {
        await ctx.scheduler.runAfter(0, internal.compactMigrations.deleteRunEventsForVerifiedRunInternal, {
          runId: args.runId,
          verified: true,
        });
      }
    }
    return {
      deleted: args.dryRun ? 0 : events.length,
      remaining: events.length === DELETE_BATCH_SIZE,
    };
  },
});

export const deleteVerifiedTerminalRunEventsBatchInternal = internalMutation({
  args: {
    status: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    status: v.string(),
    scannedRuns: v.number(),
    verifiedRuns: v.number(),
    deletedEvents: v.number(),
    skippedRuns: v.array(v.string()),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    nextStatus: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const status = terminalRunStatus(args.status);
    const page = await ctx.db
      .query("runs")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", status))
      .paginate({
        numItems: Math.min(10, batchSize(args.batchSize)),
        cursor: args.cursor ?? null,
      });

    let verifiedRuns = 0;
    let deletedEvents = 0;
    const skippedRuns: string[] = [];

    for (const run of page.page) {
      const verification = await verifyRun(ctx, run);
      if (!verification.ok) {
        skippedRuns.push(String(run._id));
        continue;
      }
      verifiedRuns += 1;
      const events = await ctx.db
        .query("runEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", run._id))
        .take(DELETE_BATCH_SIZE);
      deletedEvents += events.length;
      if (!args.dryRun) {
        for (const event of events) {
          await ctx.db.delete(event._id);
        }
        if (events.length === DELETE_BATCH_SIZE) {
          await ctx.scheduler.runAfter(0, internal.compactMigrations.deleteRunEventsForVerifiedRunInternal, {
            runId: run._id,
            verified: true,
          });
        }
      }
    }

    const nextStatus = page.isDone ? nextTerminalRunStatus(status) : status;
    if (!args.dryRun && skippedRuns.length === 0 && nextStatus) {
      await ctx.scheduler.runAfter(0, internal.compactMigrations.deleteVerifiedTerminalRunEventsBatchInternal, {
        status: nextStatus,
        cursor: page.isDone ? null : page.continueCursor,
        batchSize: args.batchSize,
      });
    }

    return {
      status,
      scannedRuns: page.page.length,
      verifiedRuns,
      deletedEvents: args.dryRun ? 0 : deletedEvents,
      skippedRuns,
      isDone: page.isDone && nextStatus === null,
      continueCursor: page.isDone ? null : page.continueCursor,
      nextStatus,
    };
  },
});

export const cleanupTerminalStageStatesInternal = internalMutation({
  args: {
    status: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    status: v.string(),
    scannedRuns: v.number(),
    deletedStageStates: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    nextStatus: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const status = terminalRunStatus(args.status);
    const page = await ctx.db
      .query("runs")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", status))
      .paginate({
        numItems: Math.min(10, batchSize(args.batchSize)),
        cursor: args.cursor ?? null,
      });
    let deletedStageStates = 0;
    for (const run of page.page) {
      for (const stage of CHECKPOINT_STAGES) {
        const state = await ctx.db
          .query("runStageStates")
          .withIndex("by_run_and_stage", (q) => q.eq("runId", run._id).eq("stage", stage))
          .unique();
        if (!state) continue;
        deletedStageStates += 1;
        if (!args.dryRun) {
          await ctx.db.delete(state._id);
        }
      }
    }
    const nextStatus = page.isDone ? nextTerminalRunStatus(status) : status;
    if (!args.dryRun && nextStatus) {
      await ctx.scheduler.runAfter(0, internal.compactMigrations.cleanupTerminalStageStatesInternal, {
        status: nextStatus,
        cursor: page.isDone ? null : page.continueCursor,
        batchSize: args.batchSize,
      });
    }
    return {
      status,
      scannedRuns: page.page.length,
      deletedStageStates: args.dryRun ? 0 : deletedStageStates,
      isDone: page.isDone && nextStatus === null,
      continueCursor: page.isDone ? null : page.continueCursor,
      nextStatus,
    };
  },
});

async function clearParticipantRawArtifactRef(ctx: MutationCtx, artifact: Doc<"runArtifacts">) {
  if (artifact.artifactType !== "openrouter.raw") {
    return;
  }
  const participantId = (artifact.metadata as { participantId?: Id<"runParticipants"> } | undefined)?.participantId;
  if (!participantId) {
    return;
  }
  const participant = await ctx.db.get(participantId);
  if (!participant) {
    return;
  }
  if (artifact.stage === "generate" && participant.generatedRawArtifactId === artifact._id) {
    await ctx.db.patch(participant._id, { generatedRawArtifactId: undefined });
  }
  if (artifact.stage === "critique" && participant.critiqueRawArtifactId === artifact._id) {
    await ctx.db.patch(participant._id, { critiqueRawArtifactId: undefined });
  }
  if (artifact.stage === "revise" && participant.revisedRawArtifactId === artifact._id) {
    await ctx.db.patch(participant._id, { revisedRawArtifactId: undefined });
  }
  if (artifact.stage === "vote" && participant.finalRawArtifactId === artifact._id) {
    await ctx.db.patch(participant._id, { finalRawArtifactId: undefined });
  }
}

async function deleteArtifactDocAndStorage(ctx: MutationCtx, artifact: Doc<"runArtifacts">, dryRun: boolean) {
  if (dryRun) {
    return;
  }
  await clearParticipantRawArtifactRef(ctx, artifact);
  if (artifact.storageId) {
    await ctx.storage.delete(artifact.storageId);
  }
  await ctx.db.delete(artifact._id);
}

export const cleanupRawArtifactsForTerminalRunsInternal = internalMutation({
  args: {
    artifactType: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
    olderThan: v.number(),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    artifactType: v.string(),
    scanned: v.number(),
    deletedArtifacts: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    nextArtifactType: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const artifactType = (RAW_ARTIFACT_TYPES as readonly string[]).includes(args.artifactType ?? "")
      ? args.artifactType!
      : RAW_ARTIFACT_TYPES[0];
    const page = await ctx.db
      .query("runArtifacts")
      .withIndex("by_artifact_type_and_created_at", (q) =>
        q.eq("artifactType", artifactType).lt("createdAt", args.olderThan),
      )
      .paginate({
        numItems: batchSize(args.batchSize),
        cursor: args.cursor ?? null,
      });
    let deletedArtifacts = 0;
    for (const artifact of page.page) {
      const run = await ctx.db.get(artifact.runId);
      if (!run || !(TERMINAL_RUN_STATUSES as readonly string[]).includes(run.status)) {
        continue;
      }
      deletedArtifacts += 1;
      await deleteArtifactDocAndStorage(ctx, artifact, Boolean(args.dryRun));
    }
    const artifactTypeIndex = RAW_ARTIFACT_TYPES.indexOf(artifactType as (typeof RAW_ARTIFACT_TYPES)[number]);
    const nextArtifactType = page.isDone ? (RAW_ARTIFACT_TYPES[artifactTypeIndex + 1] ?? null) : artifactType;
    if (!args.dryRun && nextArtifactType) {
      await ctx.scheduler.runAfter(0, internal.compactMigrations.cleanupRawArtifactsForTerminalRunsInternal, {
        artifactType: nextArtifactType,
        cursor: page.isDone ? null : page.continueCursor,
        olderThan: args.olderThan,
        batchSize: args.batchSize,
      });
    }
    return {
      artifactType,
      scanned: page.page.length,
      deletedArtifacts: args.dryRun ? 0 : deletedArtifacts,
      continueCursor: page.isDone ? null : page.continueCursor,
      nextArtifactType,
    };
  },
});

export const cleanupGeneratedExportsInternal = internalMutation({
  args: {
    olderThan: v.number(),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    scanned: v.number(),
    deletedExports: v.number(),
  }),
  handler: async (ctx, args) => {
    const exports = await ctx.db
      .query("exports")
      .withIndex("by_created_at", (q) => q.lt("createdAt", args.olderThan))
      .take(batchSize(args.batchSize));
    let deletedExports = 0;
    for (const exportDoc of exports) {
      deletedExports += 1;
      if (args.dryRun) continue;
      if (exportDoc.artifactId) {
        const artifact = await ctx.db.get(exportDoc.artifactId);
        if (artifact && (EXPORT_ARTIFACT_TYPES as readonly string[]).includes(artifact.artifactType)) {
          await deleteArtifactDocAndStorage(ctx, artifact, false);
        }
      }
      if (exportDoc.storageId) {
        await ctx.storage.delete(exportDoc.storageId);
      }
      await ctx.db.delete(exportDoc._id);
    }
    if (!args.dryRun && exports.length === batchSize(args.batchSize)) {
      await ctx.scheduler.runAfter(0, internal.compactMigrations.cleanupGeneratedExportsInternal, {
        olderThan: args.olderThan,
        batchSize: args.batchSize,
      });
    }
    return {
      scanned: exports.length,
      deletedExports: args.dryRun ? 0 : deletedExports,
    };
  },
});

export const cleanupTerminalJobsInternal = internalMutation({
  args: {
    status: v.optional(v.string()),
    olderThan: v.number(),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    status: v.string(),
    scannedJobs: v.number(),
    deletedJobs: v.number(),
    deletedAttempts: v.number(),
    nextStatus: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const status = terminalJobStatus(args.status);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_status_and_updated_at", (q) => q.eq("status", status).lt("updatedAt", args.olderThan))
      .take(Math.min(10, batchSize(args.batchSize)));
    let deletedJobs = 0;
    let deletedAttempts = 0;
    for (const job of jobs) {
      const attempts = await ctx.db
        .query("jobAttempts")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .take(DELETE_BATCH_SIZE);
      deletedAttempts += attempts.length;
      if (!args.dryRun) {
        for (const attempt of attempts) {
          await ctx.db.delete(attempt._id);
        }
        if (attempts.length === DELETE_BATCH_SIZE) {
          await ctx.scheduler.runAfter(0, internal.compactMigrations.cleanupTerminalJobsInternal, {
            status,
            olderThan: args.olderThan,
            batchSize: args.batchSize,
          });
          return {
            status,
            scannedJobs: jobs.length,
            deletedJobs,
            deletedAttempts,
            nextStatus: status,
          };
        }
        await ctx.db.delete(job._id);
      }
      deletedJobs += 1;
    }
    const nextStatus = jobs.length < Math.min(10, batchSize(args.batchSize)) ? nextTerminalJobStatus(status) : status;
    if (!args.dryRun && nextStatus) {
      await ctx.scheduler.runAfter(0, internal.compactMigrations.cleanupTerminalJobsInternal, {
        status: nextStatus,
        olderThan: args.olderThan,
        batchSize: args.batchSize,
      });
    }
    return {
      status,
      scannedJobs: jobs.length,
      deletedJobs: args.dryRun ? 0 : deletedJobs,
      deletedAttempts: args.dryRun ? 0 : deletedAttempts,
      nextStatus,
    };
  },
});

export const cleanupOldAuditLogsInternal = internalMutation({
  args: {
    olderThan: v.number(),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    scanned: v.number(),
    deletedAuditLogs: v.number(),
  }),
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_created_at", (q) => q.lt("createdAt", args.olderThan))
      .take(batchSize(args.batchSize));
    if (!args.dryRun) {
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
      if (logs.length === batchSize(args.batchSize)) {
        await ctx.scheduler.runAfter(0, internal.compactMigrations.cleanupOldAuditLogsInternal, {
          olderThan: args.olderThan,
          batchSize: args.batchSize,
        });
      }
    }
    return {
      scanned: logs.length,
      deletedAuditLogs: args.dryRun ? 0 : logs.length,
    };
  },
});

export const cleanupStaleRateLimitBucketsInternal = internalMutation({
  args: {
    olderThan: v.number(),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    scanned: v.number(),
    deletedBuckets: v.number(),
  }),
  handler: async (ctx, args) => {
    const buckets = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_updated_at", (q) => q.lt("updatedAt", args.olderThan))
      .take(batchSize(args.batchSize));
    if (!args.dryRun) {
      for (const bucket of buckets) {
        await ctx.db.delete(bucket._id);
      }
      if (buckets.length === batchSize(args.batchSize)) {
        await ctx.scheduler.runAfter(0, internal.compactMigrations.cleanupStaleRateLimitBucketsInternal, {
          olderThan: args.olderThan,
          batchSize: args.batchSize,
        });
      }
    }
    return {
      scanned: buckets.length,
      deletedBuckets: args.dryRun ? 0 : buckets.length,
    };
  },
});

export const cleanupExpiredAuthStateInternal = internalMutation({
  args: {
    now: v.optional(v.number()),
    staleVerifierCreatedBefore: v.optional(v.number()),
    authRateLimitOlderThan: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    deletedSessions: v.number(),
    deletedRefreshTokens: v.number(),
    deletedVerificationCodes: v.number(),
    deletedVerifiers: v.number(),
    deletedAuthRateLimits: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = batchSize(args.batchSize);
    const dryRun = Boolean(args.dryRun);

    let deletedRefreshTokens = 0;
    const expiredRefreshTokens = await ctx.db.query("authRefreshTokens").take(limit);
    for (const token of expiredRefreshTokens) {
      if (token.expirationTime >= now) continue;
      deletedRefreshTokens += 1;
      if (!dryRun) await ctx.db.delete(token._id);
    }

    let deletedVerificationCodes = 0;
    const expiredCodes = await ctx.db.query("authVerificationCodes").take(limit);
    for (const code of expiredCodes) {
      if (code.expirationTime >= now) continue;
      deletedVerificationCodes += 1;
      if (!dryRun) await ctx.db.delete(code._id);
    }

    let deletedSessions = 0;
    const expiredSessions = await ctx.db.query("authSessions").take(Math.min(10, limit));
    for (const session of expiredSessions) {
      if (session.expirationTime >= now) continue;
      deletedSessions += 1;
      if (!dryRun) {
        const tokens = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .take(DELETE_BATCH_SIZE);
        for (const token of tokens) {
          await ctx.db.delete(token._id);
          deletedRefreshTokens += 1;
        }
        if (tokens.length < DELETE_BATCH_SIZE) {
          await ctx.db.delete(session._id);
        }
      }
    }

    let deletedVerifiers = 0;
    const verifierCutoff = args.staleVerifierCreatedBefore;
    if (typeof verifierCutoff === "number") {
      const verifiers = await ctx.db.query("authVerifiers").take(limit);
      for (const verifier of verifiers) {
        if (verifier._creationTime >= verifierCutoff) continue;
        deletedVerifiers += 1;
        if (!dryRun) await ctx.db.delete(verifier._id);
      }
    }

    let deletedAuthRateLimits = 0;
    const authRateLimitCutoff = args.authRateLimitOlderThan;
    if (typeof authRateLimitCutoff === "number") {
      const rateLimits = await ctx.db.query("authRateLimits").take(limit);
      for (const rateLimit of rateLimits) {
        if (rateLimit.lastAttemptTime >= authRateLimitCutoff) continue;
        deletedAuthRateLimits += 1;
        if (!dryRun) await ctx.db.delete(rateLimit._id);
      }
    }

    if (!dryRun && (deletedSessions + deletedRefreshTokens + deletedVerificationCodes + deletedVerifiers + deletedAuthRateLimits) > 0) {
      await ctx.scheduler.runAfter(0, internal.compactMigrations.cleanupExpiredAuthStateInternal, {
        now,
        staleVerifierCreatedBefore: args.staleVerifierCreatedBefore,
        authRateLimitOlderThan: args.authRateLimitOlderThan,
        batchSize: args.batchSize,
      });
    }

    return {
      deletedSessions: dryRun ? 0 : deletedSessions,
      deletedRefreshTokens: dryRun ? 0 : deletedRefreshTokens,
      deletedVerificationCodes: dryRun ? 0 : deletedVerificationCodes,
      deletedVerifiers: dryRun ? 0 : deletedVerifiers,
      deletedAuthRateLimits: dryRun ? 0 : deletedAuthRateLimits,
    };
  },
});
