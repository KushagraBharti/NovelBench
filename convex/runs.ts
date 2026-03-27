import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  MutationCtx,
  mutation,
  QueryCtx,
  query,
} from "./_generated/server";
import { workflow } from "./workflow";
import { MODEL_SELECTION_LIMITS, resolveSelectedModels } from "@/lib/models";
import type { BenchmarkRunSummary, HumanCritiqueEntry } from "@/types";
import { requireAuthUser, requireProjectAccess } from "./lib/auth";
import { getEffectiveProviderPolicy, isModelAllowedByPolicy } from "./lib/policies";
import {
  buildPromptExcerpt,
  buildRunSearchText,
  canReadRun,
  dayKeyFromTimestamp,
  runDocToSummary,
  runDocsToBenchmarkRun,
} from "./lib/runHelpers";
import {
  createQueuedJob,
  finalizeJob,
  JOB_STATUSES,
  JOB_TYPES,
  startJobAttempt,
} from "./lib/jobs";
import {
  benchmarkStatusValidator,
  checkpointStageValidator,
  DEFAULT_RUN_RESERVE_USD_PER_MODEL,
  exposureModeValidator,
  HUMAN_CRITIQUE_EVENT,
  RUN_RESUME_EVENT,
  USER_RUNS_PER_DAY_LIMIT,
  USER_RUNS_PER_HOUR_LIMIT,
} from "./lib/constants";

const createRunArgsValidator = {
  categoryId: v.string(),
  prompt: v.string(),
  selectedModelIds: v.array(v.string()),
  customModelIds: v.optional(v.array(v.string())),
  projectId: v.optional(v.id("projects")),
  visibility: v.optional(exposureModeValidator),
};

const humanCritiqueValidator = v.object({
  id: v.optional(v.string()),
  ideaLabel: v.string(),
  targetModelId: v.string(),
  strengths: v.string(),
  weaknesses: v.string(),
  suggestions: v.string(),
  score: v.number(),
  authorLabel: v.string(),
  timestamp: v.optional(v.string()),
});

const runListFilterArgs = {
  organizationId: v.optional(v.id("organizations")),
  projectId: v.optional(v.id("projects")),
  categoryId: v.optional(v.string()),
  status: v.optional(v.string()),
  visibility: v.optional(exposureModeValidator),
  createdAfter: v.optional(v.number()),
  createdBefore: v.optional(v.number()),
};

function minimumSuccessfulModels(participantCount: number) {
  return Math.max(
    MODEL_SELECTION_LIMITS.min,
    Math.min(participantCount, Math.ceil(participantCount / 2)),
  );
}

function matchesCreatedAtRange(
  createdAt: number,
  createdAfter?: number,
  createdBefore?: number,
) {
  if (typeof createdAfter === "number" && createdAt < createdAfter) {
    return false;
  }
  if (typeof createdBefore === "number" && createdAt > createdBefore) {
    return false;
  }
  return true;
}

const ACTIVE_RUN_STATUSES = [
  "queued",
  "paused",
  "generating",
  "critiquing",
  "awaiting_human_critique",
  "revising",
  "voting",
] as const;

async function getProjectMembership(
  ctx: QueryCtx | MutationCtx,
  viewerUserId: Id<"users"> | null,
  projectId: Id<"projects">,
) {
  if (!viewerUserId) {
    return null;
  }
  return await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", projectId).eq("userId", viewerUserId),
    )
    .unique();
}

async function getOrganizationMembership(
  ctx: QueryCtx | MutationCtx,
  viewerUserId: Id<"users"> | null,
  organizationId: Id<"organizations">,
) {
  if (!viewerUserId) {
    return null;
  }
  return await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", viewerUserId),
    )
    .unique();
}

async function incrementRateLimitBucket(
  ctx: MutationCtx,
  args: {
    scopeType: "user" | "project";
    scopeId: string;
    bucketKey: string;
    window: "hour" | "day";
    limit: number;
  },
) {
  const existing = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_scope_type_and_scope_id_and_bucket_key", (q) =>
      q
        .eq("scopeType", args.scopeType)
        .eq("scopeId", args.scopeId)
        .eq("bucketKey", args.bucketKey),
    )
    .unique();

  if (existing && existing.count >= args.limit) {
    throw new ConvexError("Run launch rate limit exceeded. Please wait before starting another run.");
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      limit: args.limit,
      updatedAt: Date.now(),
    });
    return;
  }

  await ctx.db.insert("rateLimitBuckets", {
    scopeType: args.scopeType,
    scopeId: args.scopeId,
    bucketKey: args.bucketKey,
    window: args.window,
    limit: args.limit,
    count: 1,
    updatedAt: Date.now(),
  });
}

async function upsertUsageBudget(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    period: "day" | "month";
    periodKey: string;
    reservedDeltaUsd: number;
    settledDeltaUsd: number;
    updatedAt: number;
  },
) {
  const existing = await ctx.db
    .query("usageBudgets")
    .withIndex("by_org_project_period", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("projectId", args.projectId)
        .eq("period", args.period)
        .eq("periodKey", args.periodKey),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      reservedUsd: Math.max(0, existing.reservedUsd + args.reservedDeltaUsd),
      settledUsd: Math.max(0, existing.settledUsd + args.settledDeltaUsd),
      updatedAt: args.updatedAt,
    });
    return;
  }

  await ctx.db.insert("usageBudgets", {
    organizationId: args.organizationId,
    projectId: args.projectId,
    period: args.period,
    periodKey: args.periodKey,
    reservedUsd: Math.max(0, args.reservedDeltaUsd),
    settledUsd: Math.max(0, args.settledDeltaUsd),
    updatedAt: args.updatedAt,
  });
}

async function settleRunAccountingAndStats(
  ctx: MutationCtx,
  run: Doc<"runs">,
  terminalStatus: Doc<"runs">["status"],
  settledAt: number,
) {
  if (run.budgetSettledAt) {
    return;
  }

  const usageEntries = await ctx.db
    .query("usageLedger")
    .withIndex("by_run", (q) => q.eq("runId", run._id))
    .collect();
  const settledCostUsd = usageEntries.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);
  const reservedBudgetUsd = run.reservedBudgetUsd ?? 0;
  const dayKey = dayKeyFromTimestamp(run.createdAt);
  const monthKey = dayKey.slice(0, 7);

  await upsertUsageBudget(ctx, {
    organizationId: run.organizationId,
    projectId: run.projectId,
    period: "day",
    periodKey: dayKey,
    reservedDeltaUsd: -reservedBudgetUsd,
    settledDeltaUsd: settledCostUsd,
    updatedAt: settledAt,
  });
  await upsertUsageBudget(ctx, {
    organizationId: run.organizationId,
    projectId: run.projectId,
    period: "month",
    periodKey: monthKey,
    reservedDeltaUsd: -reservedBudgetUsd,
    settledDeltaUsd: settledCostUsd,
    updatedAt: settledAt,
  });

  const usageDaily = await ctx.db
    .query("projectUsageDaily")
    .withIndex("by_project_and_day", (q) => q.eq("projectId", run.projectId).eq("dayKey", dayKey))
    .unique();
  if (usageDaily) {
    await ctx.db.patch(usageDaily._id, {
      settledCostUsd: usageDaily.settledCostUsd + settledCostUsd,
      updatedAt: settledAt,
    });
  } else {
    await ctx.db.insert("projectUsageDaily", {
      projectId: run.projectId,
      dayKey,
      runCount: 1,
      settledCostUsd,
      updatedAt: settledAt,
    });
  }

  const categoryStats = await ctx.db
    .query("categoryStatsDaily")
    .withIndex("by_category_and_day", (q) => q.eq("categoryId", run.categoryId).eq("dayKey", dayKey))
    .unique();
  const completedRuns = terminalStatus === "complete" ? 1 : 0;
  const partialRuns = terminalStatus === "partial" || terminalStatus === "dead_lettered" ? 1 : 0;
  if (categoryStats) {
    await ctx.db.patch(categoryStats._id, {
      completedRuns: categoryStats.completedRuns + completedRuns,
      partialRuns: categoryStats.partialRuns + partialRuns,
      updatedAt: settledAt,
    });
  } else {
    await ctx.db.insert("categoryStatsDaily", {
      categoryId: run.categoryId,
      dayKey,
      runs: 1,
      completedRuns,
      partialRuns,
      updatedAt: settledAt,
    });
  }

  await ctx.db.patch(run._id, {
    settledCostUsd,
    budgetSettledAt: settledAt,
    updatedAt: Math.max(run.updatedAt, settledAt),
  });
}

async function loadAccessibleRun(
  ctx: QueryCtx,
  runId: Id<"runs">,
) {
  const run = await ctx.db.get(runId);
  if (!run) {
    return null;
  }
  const viewerUserId = await getAuthUserId(ctx);
  const membership = await getProjectMembership(ctx, viewerUserId, run.projectId);
  const organizationMembership = await getOrganizationMembership(
    ctx,
    viewerUserId,
    run.organizationId,
  );
  if (!canReadRun(run, viewerUserId, membership, organizationMembership)) {
    return null;
  }
  return { run, viewerUserId, membership, organizationMembership };
}

async function hydrateRun(
  ctx: QueryCtx | MutationCtx,
  run: Doc<"runs">,
) {
  const [participants, events] = await Promise.all([
    ctx.db.query("runParticipants").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
    ctx.db
      .query("runEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", run._id))
      .collect(),
  ]);
  return runDocsToBenchmarkRun({ run, participants, events });
}

async function collectVisibleRunSummariesPage(
  ctx: QueryCtx,
  args: {
    paginationOpts: { numItems: number; cursor: string | null };
    categoryId?: string;
    status?: string;
    visibility?: Doc<"runs">["visibility"];
    createdAfter?: number;
    createdBefore?: number;
  },
  fetchPage: (paginationOpts: { numItems: number; cursor: string | null }) => Promise<{
    page: Doc<"runs">[];
    isDone: boolean;
    continueCursor: string | null;
  }>,
) {
  const viewerUserId = await getAuthUserId(ctx);
  const results: BenchmarkRunSummary[] = [];
  let cursor = args.paginationOpts.cursor;
  let isDone = false;

  while (results.length < args.paginationOpts.numItems && !isDone) {
    const pageResult = await fetchPage({
      numItems: args.paginationOpts.numItems,
      cursor,
    });

    for (const run of pageResult.page) {
      if (args.visibility && run.visibility !== args.visibility) {
        continue;
      }
      if (args.categoryId && run.categoryId !== args.categoryId) {
        continue;
      }
      if (args.status && run.status !== args.status) {
        continue;
      }
      if (!matchesCreatedAtRange(run.createdAt, args.createdAfter, args.createdBefore)) {
        continue;
      }

      const membership = viewerUserId
        ? await getProjectMembership(ctx, viewerUserId, run.projectId)
        : null;
      const organizationMembership = viewerUserId
        ? await getOrganizationMembership(ctx, viewerUserId, run.organizationId)
        : null;
      if (!canReadRun(run, viewerUserId, membership, organizationMembership)) {
        continue;
      }

      results.push(runDocToSummary(run));
      if (results.length >= args.paginationOpts.numItems) {
        break;
      }
    }

    cursor = pageResult.continueCursor;
    isDone = pageResult.isDone;
  }

  return {
    page: results,
    isDone,
    continueCursor: cursor,
  };
}

function matchesRunSearchDocFilters(
  searchDoc: Doc<"runSearchDocs">,
  args: {
    categoryId?: string;
    status?: string;
    visibility?: Doc<"runs">["visibility"];
    createdAfter?: number;
    createdBefore?: number;
  },
  options?: {
    ignoreCategory?: boolean;
  },
) {
  if (args.visibility && searchDoc.visibility !== args.visibility) {
    return false;
  }
  if (!options?.ignoreCategory && args.categoryId && searchDoc.categoryId !== args.categoryId) {
    return false;
  }
  if (args.status && searchDoc.status !== args.status) {
    return false;
  }
  return matchesCreatedAtRange(searchDoc.createdAt, args.createdAfter, args.createdBefore);
}

function buildRunSearchDocsBaseQuery(
  ctx: QueryCtx,
  args: {
    organizationId?: Id<"organizations">;
    projectId?: Id<"projects">;
    categoryId?: string;
    status?: string;
    visibility?: Doc<"runs">["visibility"];
  },
  options?: {
    ignoreCategory?: boolean;
  },
) {
  if (args.projectId) {
    return ctx.db
      .query("runSearchDocs")
      .withIndex("by_project_and_created_at", (q) => q.eq("projectId", args.projectId!));
  }
  if (args.organizationId) {
    return ctx.db
      .query("runSearchDocs")
      .withIndex("by_org_and_created_at", (q) => q.eq("organizationId", args.organizationId!));
  }
  if (args.visibility) {
    return ctx.db
      .query("runSearchDocs")
      .withIndex("by_visibility_and_created_at", (q) => q.eq("visibility", args.visibility!));
  }
  if (args.status) {
    return ctx.db
      .query("runSearchDocs")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", args.status! as any));
  }
  if (!options?.ignoreCategory && args.categoryId) {
    return ctx.db
      .query("runSearchDocs")
      .withIndex("by_category_and_created_at", (q) => q.eq("categoryId", args.categoryId!));
  }
  return ctx.db.query("runSearchDocs").withIndex("by_created_at");
}

async function collectVisibleRunSearchDocsPage(
  ctx: QueryCtx,
  args: {
    paginationOpts: { numItems: number; cursor: string | null };
    categoryId?: string;
    status?: string;
    visibility?: Doc<"runs">["visibility"];
    createdAfter?: number;
    createdBefore?: number;
  },
  fetchPage: (paginationOpts: { numItems: number; cursor: string | null }) => Promise<{
    page: Doc<"runSearchDocs">[];
    isDone: boolean;
    continueCursor: string | null;
  }>,
  options?: {
    extraFilter?: (searchDoc: Doc<"runSearchDocs">) => boolean;
  },
) {
  const viewerUserId = await getAuthUserId(ctx);
  const results: BenchmarkRunSummary[] = [];
  let cursor = args.paginationOpts.cursor;
  let isDone = false;

  while (results.length < args.paginationOpts.numItems && !isDone) {
    const pageResult = await fetchPage({
      numItems: args.paginationOpts.numItems,
      cursor,
    });

    for (const searchDoc of pageResult.page) {
      if (!matchesRunSearchDocFilters(searchDoc, args)) {
        continue;
      }
      if (options?.extraFilter && !options.extraFilter(searchDoc)) {
        continue;
      }

      const run = await ctx.db.get(searchDoc.runId);
      if (!run) {
        continue;
      }

      const membership = viewerUserId
        ? await getProjectMembership(ctx, viewerUserId, run.projectId)
        : null;
      const organizationMembership = viewerUserId
        ? await getOrganizationMembership(ctx, viewerUserId, run.organizationId)
        : null;
      if (!canReadRun(run, viewerUserId, membership, organizationMembership)) {
        continue;
      }

      results.push(runSummaryFromSearchDoc(searchDoc, run));
      if (results.length >= args.paginationOpts.numItems) {
        break;
      }
    }

    cursor = pageResult.continueCursor;
    isDone = pageResult.isDone;
  }

  return {
    page: results,
    isDone,
    continueCursor: cursor,
  };
}

async function collectVisibleRunSearchDocMetrics(
  ctx: QueryCtx,
  args: {
    categoryId?: string;
    status?: string;
    visibility?: Doc<"runs">["visibility"];
    createdAfter?: number;
    createdBefore?: number;
  },
  fetchPage: (paginationOpts: { numItems: number; cursor: string | null }) => Promise<{
    page: Doc<"runSearchDocs">[];
    isDone: boolean;
    continueCursor: string | null;
  }>,
  options?: {
    ignoreCategory?: boolean;
    extraFilter?: (searchDoc: Doc<"runSearchDocs">) => boolean;
  },
) {
  const viewerUserId = await getAuthUserId(ctx);
  const categoryCounts: Record<string, number> = {};
  let totalMatchingRuns = 0;
  let cursor: string | null = null;
  let isDone = false;

  while (!isDone) {
    const pageResult = await fetchPage({
      numItems: 50,
      cursor,
    });

    for (const searchDoc of pageResult.page) {
      if (!matchesRunSearchDocFilters(searchDoc, args, options)) {
        continue;
      }
      if (options?.extraFilter && !options.extraFilter(searchDoc)) {
        continue;
      }

      const run = await ctx.db.get(searchDoc.runId);
      if (!run) {
        continue;
      }

      const membership = viewerUserId
        ? await getProjectMembership(ctx, viewerUserId, run.projectId)
        : null;
      const organizationMembership = viewerUserId
        ? await getOrganizationMembership(ctx, viewerUserId, run.organizationId)
        : null;
      if (!canReadRun(run, viewerUserId, membership, organizationMembership)) {
        continue;
      }

      totalMatchingRuns += 1;
      categoryCounts[searchDoc.categoryId] = (categoryCounts[searchDoc.categoryId] ?? 0) + 1;
    }

    cursor = pageResult.continueCursor;
    isDone = pageResult.isDone;
  }

  return {
    totalMatchingRuns,
    categoryCounts,
  };
}

function runSummaryFromSearchDoc(
  searchDoc: Doc<"runSearchDocs">,
  run: Doc<"runs">,
): BenchmarkRunSummary {
  return {
    id: searchDoc.runId,
    categoryId: searchDoc.categoryId,
    prompt: searchDoc.promptExcerpt,
    timestamp: new Date(searchDoc.createdAt).toISOString(),
    updatedAt: new Date(run.updatedAt).toISOString(),
    status: searchDoc.status,
    modelCount: run.participantCount,
    completedModelCount: run.completedParticipantCount,
    failedModelCount: run.failedParticipantCount,
  };
}

async function recordResearchPreflightJob(
  ctx: MutationCtx,
  args: {
    runId: Id<"runs">;
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    createdByUserId: Id<"users">;
    researchEnabled: boolean;
    exaConfigured: boolean;
  },
) {
  const now = Date.now();
  const jobId = await createQueuedJob(ctx, {
    organizationId: args.organizationId,
    projectId: args.projectId,
    runId: args.runId,
    jobType: JOB_TYPES.researchPreflight,
    idempotencyKey: `${args.runId}:research-preflight`,
    maxAttempts: 1,
    deadlineAt: now + 60_000,
    createdByUserId: args.createdByUserId,
    metadata: {
      researchEnabled: args.researchEnabled,
      exaConfigured: args.exaConfigured,
    },
  });
  await startJobAttempt(ctx, {
    jobId,
    startedAt: now,
    metadata: {
      researchEnabled: args.researchEnabled,
      exaConfigured: args.exaConfigured,
    },
  });
  await finalizeJob(ctx, {
    jobId,
    status: JOB_STATUSES.complete,
    completedAt: now,
    error:
      args.researchEnabled && !args.exaConfigured
        ? "Research enabled but Exa is not configured; benchmark stages will continue without search."
        : undefined,
  });
}

async function recordValidationRepairJob(
  ctx: MutationCtx,
  args: {
    run: Doc<"runs">;
    createdAt: number;
    reason: string;
  },
) {
  const idempotencyKey = `${args.run._id}:validation-repair`;
  const existing = await ctx.db
    .query("jobs")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
  if (existing) {
    return;
  }

  const jobId = await createQueuedJob(ctx, {
    organizationId: args.run.organizationId,
    projectId: args.run.projectId,
    runId: args.run._id,
    jobType: JOB_TYPES.validationRunRepair,
    idempotencyKey,
    maxAttempts: 1,
    deadlineAt: args.createdAt + 5 * 60_000,
    createdByUserId: args.run.ownerUserId,
    metadata: {
      recommendation: "restart_run",
    },
  });
  await startJobAttempt(ctx, {
    jobId,
    startedAt: args.createdAt,
    metadata: {
      reason: args.reason,
    },
  });
  await finalizeJob(ctx, {
    jobId,
    status: JOB_STATUSES.deadLettered,
    completedAt: args.createdAt,
    error: args.reason,
    deadLetterReason: "Run repair requires a manual restart with the same prompt and model set.",
  });
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    ...runListFilterArgs,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const baseQuery = buildRunSearchDocsBaseQuery(ctx, args);
    const page = await collectVisibleRunSearchDocsPage(ctx, args, (paginationOpts) =>
      baseQuery.order("desc").paginate(paginationOpts),
    );
    const [filteredMetrics, allCategoryMetrics] = await Promise.all([
      collectVisibleRunSearchDocMetrics(ctx, args, (paginationOpts) =>
        baseQuery.order("desc").paginate(paginationOpts),
      ),
      collectVisibleRunSearchDocMetrics(
        ctx,
        args,
        (paginationOpts) =>
          buildRunSearchDocsBaseQuery(ctx, args, { ignoreCategory: true })
            .order("desc")
            .paginate(paginationOpts),
        { ignoreCategory: true },
      ),
    ]);

    return {
      ...page,
      totalMatchingRuns: filteredMetrics.totalMatchingRuns,
      categoryCounts: allCategoryMetrics.categoryCounts,
    };
  },
});

export const get = query({
  args: { runId: v.id("runs") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const accessible = await loadAccessibleRun(ctx, args.runId);
    if (!accessible) {
      return null;
    }
    return await hydrateRun(ctx, accessible.run);
  },
});

export const listEvents = query({
  args: {
    runId: v.id("runs"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const accessible = await loadAccessibleRun(ctx, args.runId);
    if (!accessible) {
      throw new ConvexError("Run not found");
    }
    return await ctx.db
      .query("runEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", args.runId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const liveActivity = query({
  args: {
    runId: v.id("runs"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const accessible = await loadAccessibleRun(ctx, args.runId);
    if (!accessible) {
      throw new ConvexError("Run not found");
    }

    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", args.runId))
      .collect();

    return events
      .filter((event) =>
        event.kind === "live_token" ||
        event.kind === "tool_call_activity" ||
        event.kind === "reasoning_detail",
      )
      .map((event) => ({
        id: String(event._id),
        kind: event.kind,
        stage: event.stage,
        participantModelId: event.participantModelId,
        payload: event.payload ?? null,
        createdAt: event.createdAt,
      }));
  },
});

export const listArtifacts = query({
  args: {
    runId: v.id("runs"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const accessible = await loadAccessibleRun(ctx, args.runId);
    if (!accessible) {
      throw new ConvexError("Run not found");
    }

    const page = await ctx.db
      .query("runArtifacts")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (artifact: Doc<"runArtifacts">) => ({
          ...artifact,
          url: artifact.storageId ? await ctx.storage.getUrl(artifact.storageId) : null,
        })),
      ),
    };
  },
});

export const search = query({
  args: {
    query: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
    limit: v.optional(v.number()),
    ...runListFilterArgs,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const paginationOpts = args.paginationOpts
      ? {
          ...args.paginationOpts,
          numItems: Math.min(Math.max(args.paginationOpts.numItems, 1), 50),
        }
      : {
          numItems: Math.min(args.limit ?? 20, 50),
          cursor: null,
        };

    const normalizedQuery = args.query.trim().toLowerCase();
    const buildSearchQuery = (categoryId?: string) =>
      ((ctx.db.query("runSearchDocs") as any)
        .withSearchIndex("search_prompt", (q: any) => {
        let next = q.search("promptSearchText", args.query);
        if (args.visibility) {
          next = next.eq("visibility", args.visibility);
        }
        if (args.organizationId) {
          next = next.eq("organizationId", args.organizationId);
        }
        if (args.projectId) {
          next = next.eq("projectId", args.projectId);
        }
        if (categoryId) {
          next = next.eq("categoryId", categoryId);
        }
        if (args.status) {
          next = next.eq("status", args.status as any);
        }
        return next;
      })) as any;

    try {
      const searchQuery = buildSearchQuery(args.categoryId);
      const fetchSearchPage = (nextPaginationOpts: { numItems: number; cursor: string | null }) =>
        searchQuery.paginate(nextPaginationOpts);
      const page = await collectVisibleRunSearchDocsPage(
        ctx,
        {
          ...args,
          paginationOpts,
        },
        fetchSearchPage,
      );
      const [filteredMetrics, allCategoryMetrics] = await Promise.all([
        collectVisibleRunSearchDocMetrics(ctx, args, fetchSearchPage),
        collectVisibleRunSearchDocMetrics(
          ctx,
          { ...args, categoryId: undefined },
          (nextPaginationOpts) => buildSearchQuery(undefined).paginate(nextPaginationOpts),
        ),
      ]);

      return {
        ...page,
        totalMatchingRuns: filteredMetrics.totalMatchingRuns,
        categoryCounts: allCategoryMetrics.categoryCounts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("is currently staged and not available to query")) {
        throw error;
      }

      const baseQuery = buildRunSearchDocsBaseQuery(ctx, args);
      const extraFilter = (searchDoc: Doc<"runSearchDocs">) =>
        searchDoc.promptSearchText.includes(normalizedQuery);
      const page = await collectVisibleRunSearchDocsPage(
        ctx,
        {
          ...args,
          paginationOpts,
        },
        (nextPaginationOpts) => baseQuery.order("desc").paginate(nextPaginationOpts),
        { extraFilter },
      );
      const [filteredMetrics, allCategoryMetrics] = await Promise.all([
        collectVisibleRunSearchDocMetrics(
          ctx,
          args,
          (nextPaginationOpts) => baseQuery.order("desc").paginate(nextPaginationOpts),
          { extraFilter },
        ),
        collectVisibleRunSearchDocMetrics(
          ctx,
          { ...args, categoryId: undefined },
          (nextPaginationOpts) =>
            buildRunSearchDocsBaseQuery(ctx, args, { ignoreCategory: true })
              .order("desc")
              .paginate(nextPaginationOpts),
          { extraFilter },
        ),
      ]);

      return {
        ...page,
        totalMatchingRuns: filteredMetrics.totalMatchingRuns,
        categoryCounts: allCategoryMetrics.categoryCounts,
      };
    }
  },
});

export const create = mutation({
  args: createRunArgsValidator,
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const projectId = args.projectId ?? user.defaultProjectId;
    if (!projectId) {
      throw new ConvexError("No default project is configured");
    }

    await requireProjectAccess(ctx, projectId, "editor");
    const project = await ctx.db.get(projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    const policy = await getEffectiveProviderPolicy(ctx, project.organizationId, projectId);

    const openrouterEntry = await ctx.db
      .query("providerVaultEntries")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "openrouter"),
      )
      .unique();
    if (!openrouterEntry || openrouterEntry.revokedAt) {
      throw new ConvexError("OpenRouter API key is not configured");
    }
    const exaEntry = await ctx.db
      .query("providerVaultEntries")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "exa"),
      )
      .unique();

    const selectedModels = resolveSelectedModels(
      args.selectedModelIds,
      args.customModelIds ?? [],
    );
    if (selectedModels.length < MODEL_SELECTION_LIMITS.min) {
      throw new ConvexError(`Select at least ${MODEL_SELECTION_LIMITS.min} models`);
    }
    if (selectedModels.length > MODEL_SELECTION_LIMITS.max) {
      throw new ConvexError(`Select at most ${MODEL_SELECTION_LIMITS.max} models`);
    }
    if (policy && selectedModels.length > policy.maxModelsPerRun) {
      throw new ConvexError(`This project allows at most ${policy.maxModelsPerRun} models per run`);
    }
    if (
      policy?.allowedModelIds?.length &&
      selectedModels.some((model) => !isModelAllowedByPolicy(model, policy.allowedModelIds))
    ) {
      throw new ConvexError("One or more selected models are blocked by project policy");
    }

    if (policy) {
      const activeCounts = await Promise.all(
        ACTIVE_RUN_STATUSES.map((status) =>
          ctx.db
            .query("runs")
            .withIndex("by_project_and_status_and_created_at", (q) =>
              q.eq("projectId", projectId).eq("status", status),
            )
            .take(policy.maxConcurrentRuns),
        ),
      );
      const activeRunCount = activeCounts.reduce((sum, runs) => sum + runs.length, 0);
      if (activeRunCount >= policy.maxConcurrentRuns) {
        throw new ConvexError("This project has reached its concurrent run limit");
      }

      const projectedRunReserveUsd = selectedModels.length * DEFAULT_RUN_RESERVE_USD_PER_MODEL;
      const dayKey = dayKeyFromTimestamp(Date.now());
      const monthKeyPrefix = dayKey.slice(0, 7);
      const [todayUsage, monthlyUsageEntries] = await Promise.all([
        ctx.db
          .query("projectUsageDaily")
          .withIndex("by_project_and_day", (q) => q.eq("projectId", projectId).eq("dayKey", dayKey))
          .unique(),
        ctx.db
          .query("projectUsageDaily")
          .withIndex("by_project_and_day", (q) => q.eq("projectId", projectId))
          .collect(),
      ]);
      const todaySettled = todayUsage?.settledCostUsd ?? 0;
      const monthSettled = monthlyUsageEntries
        .filter((entry) => entry.dayKey.startsWith(monthKeyPrefix))
        .reduce((sum, entry) => sum + entry.settledCostUsd, 0);

      if (
        policy.hardBlockOnBudget &&
        typeof policy.dailySpendLimitUsd === "number" &&
        todaySettled + projectedRunReserveUsd > policy.dailySpendLimitUsd
      ) {
        throw new ConvexError("Daily project spend cap would be exceeded by this run");
      }
      if (
        policy.hardBlockOnBudget &&
        typeof policy.monthlySpendLimitUsd === "number" &&
        monthSettled + projectedRunReserveUsd > policy.monthlySpendLimitUsd
      ) {
        throw new ConvexError("Monthly project spend cap would be exceeded by this run");
      }
    }

    const now = Date.now();
    const dayKey = dayKeyFromTimestamp(now);
    const hourKey = new Date(now).toISOString().slice(0, 13);
    await incrementRateLimitBucket(ctx, {
      scopeType: "user",
      scopeId: String(user._id),
      bucketKey: `hour:${hourKey}`,
      window: "hour",
      limit: USER_RUNS_PER_HOUR_LIMIT,
    });
    await incrementRateLimitBucket(ctx, {
      scopeType: "user",
      scopeId: String(user._id),
      bucketKey: `day:${dayKey}`,
      window: "day",
      limit: USER_RUNS_PER_DAY_LIMIT,
    });

    const projectedRunReserveUsd = selectedModels.length * DEFAULT_RUN_RESERVE_USD_PER_MODEL;
    const runId = await ctx.db.insert("runs", {
      legacyRunId: undefined,
      ownerUserId: user._id,
      organizationId: project.organizationId,
      projectId,
      categoryId: args.categoryId,
      prompt: args.prompt.trim(),
      promptExcerpt: buildPromptExcerpt(args.prompt),
      selectedModels,
      status: "queued",
      currentStep: "Queued for execution",
      checkpointStage: "generate",
      visibility: args.visibility ?? "public_full",
      workflowId: undefined,
      participantCount: selectedModels.length,
      minimumSuccessfulModels: minimumSuccessfulModels(selectedModels.length),
      completedParticipantCount: 0,
      failedParticipantCount: 0,
      pauseRequested: false,
      cancellationRequested: false,
      error: undefined,
      finalWinnerModelId: undefined,
      finalWinnerName: undefined,
      promptCaptureCount: 0,
      exportCount: 0,
      reservedBudgetUsd: projectedRunReserveUsd,
      settledCostUsd: 0,
      budgetSettledAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await upsertUsageBudget(ctx, {
      organizationId: project.organizationId,
      projectId,
      period: "day",
      periodKey: dayKey,
      reservedDeltaUsd: projectedRunReserveUsd,
      settledDeltaUsd: 0,
      updatedAt: now,
    });
    await upsertUsageBudget(ctx, {
      organizationId: project.organizationId,
      projectId,
      period: "month",
      periodKey: dayKey.slice(0, 7),
      reservedDeltaUsd: projectedRunReserveUsd,
      settledDeltaUsd: 0,
      updatedAt: now,
    });
    const usageDaily = await ctx.db
      .query("projectUsageDaily")
      .withIndex("by_project_and_day", (q) => q.eq("projectId", projectId).eq("dayKey", dayKey))
      .unique();
    if (usageDaily) {
      await ctx.db.patch(usageDaily._id, {
        runCount: usageDaily.runCount + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("projectUsageDaily", {
        projectId,
        dayKey,
        runCount: 1,
        settledCostUsd: 0,
        updatedAt: now,
      });
    }
    const categoryStats = await ctx.db
      .query("categoryStatsDaily")
      .withIndex("by_category_and_day", (q) => q.eq("categoryId", args.categoryId).eq("dayKey", dayKey))
      .unique();
    if (categoryStats) {
      await ctx.db.patch(categoryStats._id, {
        runs: categoryStats.runs + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("categoryStatsDaily", {
        categoryId: args.categoryId,
        dayKey,
        runs: 1,
        completedRuns: 0,
        partialRuns: 0,
        updatedAt: now,
      });
    }

    const participants = await Promise.all(
      selectedModels.map((model, index) =>
        ctx.db.insert("runParticipants", {
          runId,
          order: index,
          modelId: model.id,
          openRouterId: model.openRouterId,
          modelName: model.name,
          stage: "generate",
          status: "queued",
          estimatedCostUsd: 0,
        }),
      ),
    );

    await ctx.db.insert("runStageStates", {
      runId,
      stage: "generate",
      status: "queued",
      eligibleCount: selectedModels.length,
      completedCount: 0,
      readyCount: 0,
      startedAt: now,
      completedAt: undefined,
    });

    await ctx.db.insert("runSearchDocs", {
      runId,
      organizationId: project.organizationId,
      projectId,
      categoryId: args.categoryId,
      status: "queued",
      visibility: args.visibility ?? "public_full",
      promptSearchText: buildRunSearchText(args.prompt),
      promptExcerpt: buildPromptExcerpt(args.prompt),
      createdAt: now,
    });

    const jobId = await createQueuedJob(ctx, {
      organizationId: project.organizationId,
      projectId,
      runId,
      jobType: JOB_TYPES.benchmarkRun,
      idempotencyKey: `${runId}:workflow`,
      maxAttempts: 3,
      deadlineAt: now + 1000 * 60 * 15,
      createdByUserId: user._id,
      metadata: {
        categoryId: args.categoryId,
        selectedModelIds: selectedModels.map((model) => model.id),
      },
    });

    await ctx.db.insert("runEvents", {
      runId,
      stage: "generate",
      kind: "queued",
      participantModelId: undefined,
      message: "Benchmark run queued",
      payload: {
        createdByUserId: user._id,
        selectedModelIds: selectedModels.map((model) => model.id),
      },
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: project.organizationId,
      projectId,
      action: "run.created",
      resourceType: "run",
      resourceId: String(runId),
      metadata: {
        participantCount: selectedModels.length,
        visibility: args.visibility ?? "public_full",
      },
      createdAt: now,
    });

    const workflowId = await workflow.start(
      ctx,
      internal.benchmarkWorkflow.runBenchmarkWorkflow,
      { runId },
    );

    await ctx.db.patch(runId, {
      workflowId,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(jobId, {
      workflowId,
      updatedAt: Date.now(),
    });
    await startJobAttempt(ctx, {
      jobId,
      workflowId,
      startedAt: now,
      metadata: {
        workflowId,
      },
    });
    await recordResearchPreflightJob(ctx, {
      runId,
      organizationId: project.organizationId,
      projectId,
      createdByUserId: user._id,
      researchEnabled: Boolean(policy?.researchEnabled),
      exaConfigured: Boolean(exaEntry && !exaEntry.revokedAt),
    });

    const run = await ctx.db.get(runId);
    if (!run) {
      throw new ConvexError("Run creation failed");
    }
    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
      .collect();
    const participantDocs = await Promise.all(participants.map((participantId) => ctx.db.get(participantId)));

    return runDocsToBenchmarkRun({
      run,
      participants: participantDocs.filter(Boolean) as Doc<"runParticipants">[],
      events,
    });
  },
});

export const pause = mutation({
  args: {
    runId: v.id("runs"),
    reason: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    const { user } = await requireProjectAccess(ctx, run.projectId, "editor");
    const now = Date.now();

    await ctx.db.patch(run._id, {
      pauseRequested: true,
      status: "paused",
      currentStep: "Run paused",
      updatedAt: now,
    });
    await ctx.db.insert("runEvents", {
      runId: run._id,
      stage: run.checkpointStage,
      kind: "run_paused",
      participantModelId: undefined,
      message: args.reason ?? "Paused by user",
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      action: "run.paused",
      resourceType: "run",
      resourceId: String(run._id),
      metadata: { stage: run.checkpointStage },
      createdAt: now,
    });

    const nextRun = await ctx.db.get(run._id);
    return await hydrateRun(ctx, nextRun!);
  },
});

export const resume = mutation({
  args: { runId: v.id("runs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    const { user } = await requireProjectAccess(ctx, run.projectId, "editor");
    const now = Date.now();

    await ctx.db.patch(run._id, {
      pauseRequested: false,
      status: run.checkpointStage === "human_critique" ? "awaiting_human_critique" : "queued",
      currentStep:
        run.checkpointStage === "human_critique"
          ? "Waiting for human critique review"
          : "Queued to resume",
      updatedAt: now,
      error: undefined,
    });
    await ctx.db.insert("runEvents", {
      runId: run._id,
      stage: run.checkpointStage,
      kind: "run_resumed",
      participantModelId: undefined,
      message: "Resumed by user",
      createdAt: now,
    });
    if (run.workflowId) {
      await workflow.sendEvent(ctx, {
        workflowId: run.workflowId as never,
        name: RUN_RESUME_EVENT,
      });
    }
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      action: "run.resumed",
      resourceType: "run",
      resourceId: String(run._id),
      metadata: { stage: run.checkpointStage },
      createdAt: now,
    });

    const nextRun = await ctx.db.get(run._id);
    return await hydrateRun(ctx, nextRun!);
  },
});

export const proceed = mutation({
  args: { runId: v.id("runs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    const { user } = await requireProjectAccess(ctx, run.projectId, "editor");
    const now = Date.now();

    if (run.status !== "awaiting_human_critique") {
      throw new ConvexError("Run is not waiting for human critique");
    }

    await ctx.db.patch(run._id, {
      status: "queued",
      currentStep: "Queued for revision",
      updatedAt: now,
      pauseRequested: false,
    });
    await ctx.db.insert("runEvents", {
      runId: run._id,
      stage: "human_critique",
      kind: "human_critique_proceeded",
      participantModelId: undefined,
      message: "Human critique checkpoint approved",
      createdAt: now,
    });
    if (run.workflowId) {
      await workflow.sendEvent(ctx, {
        workflowId: run.workflowId as never,
        name: HUMAN_CRITIQUE_EVENT,
      });
    }
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      action: "run.proceeded",
      resourceType: "run",
      resourceId: String(run._id),
      metadata: { stage: "human_critique" },
      createdAt: now,
    });

    const nextRun = await ctx.db.get(run._id);
    return await hydrateRun(ctx, nextRun!);
  },
});

export const cancel = mutation({
  args: {
    runId: v.id("runs"),
    reason: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    const { user } = await requireProjectAccess(ctx, run.projectId, "editor");
    const now = Date.now();

    const participants = await ctx.db
      .query("runParticipants")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();

    await Promise.all(
      participants.map((participant) => {
        if (participant.status === "complete" || participant.status === "failed") {
          return Promise.resolve();
        }
        return ctx.db.patch(participant._id, {
          status: "canceled",
          completedAt: now,
        });
      }),
    );

    await ctx.db.patch(run._id, {
      cancellationRequested: true,
      status: "canceled",
      currentStep: "Run canceled",
      updatedAt: now,
    });
    await settleRunAccountingAndStats(ctx, {
      ...run,
      cancellationRequested: true,
      status: "canceled",
      currentStep: "Run canceled",
      updatedAt: now,
    }, "canceled", now);
    await ctx.db.insert("runEvents", {
      runId: run._id,
      stage: run.checkpointStage,
      kind: "run_canceled",
      participantModelId: undefined,
      message: args.reason ?? "Canceled by user",
      createdAt: now,
    });
    if (run.workflowId) {
      await workflow.cancel(ctx, run.workflowId as never);
    }
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      action: "run.canceled",
      resourceType: "run",
      resourceId: String(run._id),
      metadata: { stage: run.checkpointStage },
      createdAt: now,
    });

    const nextRun = await ctx.db.get(run._id);
    return await hydrateRun(ctx, nextRun!);
  },
});

export const submitHumanCritiques = mutation({
  args: {
    runId: v.id("runs"),
    critiques: v.array(humanCritiqueValidator),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    const { user } = await requireProjectAccess(ctx, run.projectId, "editor");
    const now = Date.now();
    const critiques: HumanCritiqueEntry[] = args.critiques.map((critique, index) => ({
      ...critique,
      id: critique.id ?? `human_${now}_${index}`,
      timestamp: critique.timestamp ?? new Date(now).toISOString(),
    }));

    await ctx.db.insert("runEvents", {
      runId: run._id,
      stage: "human_critique",
      kind: "human_critique_submitted",
      participantModelId: undefined,
      message: `Submitted ${critiques.length} human critiques`,
      payload: { critiques },
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      action: "run.human_critiques_submitted",
      resourceType: "run",
      resourceId: String(run._id),
      metadata: { count: critiques.length },
      createdAt: now,
    });

    const nextRun = await ctx.db.get(run._id);
    return await hydrateRun(ctx, nextRun!);
  },
});

export const getRunBundleInternal = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    const [participants, events, project, projectPolicy, orgPolicy, vaultEntry, exaEntry] = await Promise.all([
      ctx.db.query("runParticipants").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
      ctx.db
        .query("runEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", run._id))
        .collect(),
      ctx.db.get(run.projectId),
      ctx.db
        .query("providerPolicies")
        .withIndex("by_organization_and_project", (q) =>
          q.eq("organizationId", run.organizationId).eq("projectId", run.projectId),
        )
        .unique(),
      ctx.db
        .query("providerPolicies")
        .withIndex("by_organization_and_project", (q) =>
          q.eq("organizationId", run.organizationId).eq("projectId", undefined),
        )
        .unique(),
      ctx.db
        .query("providerVaultEntries")
        .withIndex("by_user_and_provider", (q) =>
          q.eq("userId", run.ownerUserId).eq("provider", "openrouter"),
        )
        .unique(),
      ctx.db
        .query("providerVaultEntries")
        .withIndex("by_user_and_provider", (q) =>
          q.eq("userId", run.ownerUserId).eq("provider", "exa"),
        )
        .unique(),
    ]);

    return {
      run,
      participants,
      events,
      project,
      policy: projectPolicy ?? orgPolicy,
      vaultEntry,
      exaEntry,
    };
  },
});

export const getWorkflowBundleInternal = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }

    const participants = await ctx.db
      .query("runParticipants")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();

    return {
      run: {
        _id: run._id,
        categoryId: run.categoryId,
        selectedModels: run.selectedModels,
        status: run.status,
        currentStep: run.currentStep,
        checkpointStage: run.checkpointStage,
        minimumSuccessfulModels: run.minimumSuccessfulModels,
        cancellationRequested: run.cancellationRequested,
        pauseRequested: run.pauseRequested,
      },
      participants: participants.map((participant) => ({
        _id: participant._id,
        modelId: participant.modelId,
        modelName: participant.modelName,
        order: participant.order,
        stage: participant.stage,
        status: participant.status,
        generatedIdea: participant.generatedIdea ? true : false,
        critiqueResult: participant.critiqueResult
          ? {
              rankings: participant.critiqueResult.rankings,
            }
          : undefined,
        revisedIdea: participant.revisedIdea ? true : false,
        finalRanking: participant.finalRanking,
      })),
    };
  },
});

export const insertArtifactInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    participantModelId: v.optional(v.string()),
    stage: checkpointStageValidator,
    artifactType: v.string(),
    label: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    sizeBytes: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  },
  returns: v.id("runArtifacts"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("runArtifacts", args);
  },
});

export const recordWebTraceInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    stage: v.union(v.literal("generate"), v.literal("revise")),
    participantModelId: v.string(),
    trace: v.any(),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }

    await ctx.db.insert("runEvents", {
      runId: args.runId,
      stage: args.stage,
      kind: "web_stage_trace",
      participantModelId: args.participantModelId,
      message: `${args.participantModelId} ${args.stage} web trace`,
      payload: args.trace,
      createdAt: args.createdAt,
    });

    if (args.trace?.usage?.usedSearch) {
      await ctx.db.insert("usageLedger", {
        runId: args.runId,
        organizationId: run.organizationId,
        projectId: run.projectId,
        participantModelId: args.participantModelId,
        provider: "exa",
        stage: args.stage,
        estimatedCostUsd: 0,
        createdAt: args.createdAt,
      });
    }

    return null;
  },
});

export const appendLiveTokenEventInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    stage: v.union(v.literal("generate"), v.literal("revise")),
    participantModelId: v.string(),
    chunk: v.string(),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      stage: args.stage,
      kind: "live_token",
      participantModelId: args.participantModelId,
      message: `${args.participantModelId} ${args.stage} token chunk`,
      payload: { chunk: args.chunk },
      createdAt: args.createdAt,
    });
    return null;
  },
});

export const appendToolCallEventInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    stage: v.union(v.literal("generate"), v.literal("revise")),
    participantModelId: v.string(),
    state: v.union(v.literal("started"), v.literal("completed"), v.literal("failed")),
    toolName: v.literal("search_web"),
    callId: v.string(),
    turn: v.optional(v.number()),
    query: v.optional(v.string()),
    resultCount: v.optional(v.number()),
    urls: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      stage: args.stage,
      kind: "tool_call_activity",
      participantModelId: args.participantModelId,
      message: `${args.participantModelId} ${args.stage} ${args.toolName} ${args.state}`,
      payload: {
        state: args.state,
        toolName: args.toolName,
        callId: args.callId,
        turn: args.turn,
        query: args.query,
        resultCount: args.resultCount,
        urls: args.urls,
        error: args.error,
      },
      createdAt: args.createdAt,
    });
    return null;
  },
});

export const appendReasoningDetailsInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    stage: v.union(v.literal("generate"), v.literal("revise")),
    participantModelId: v.string(),
    turn: v.optional(v.number()),
    details: v.array(
      v.object({
        detailId: v.string(),
        detailType: v.union(v.literal("reasoning.summary"), v.literal("reasoning.encrypted"), v.literal("reasoning.text")),
        format: v.optional(v.string()),
        index: v.optional(v.number()),
        text: v.optional(v.string()),
        summary: v.optional(v.string()),
        data: v.optional(v.string()),
        signature: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const detail of args.details) {
      await ctx.db.insert("runEvents", {
        runId: args.runId,
        stage: args.stage,
        kind: "reasoning_detail",
        participantModelId: args.participantModelId,
        message: `${args.participantModelId} ${args.stage} reasoning detail`,
        payload: {
          ...detail,
          turn: args.turn,
        },
        createdAt: args.createdAt,
      });
    }
    return null;
  },
});

export const updateRunForStageInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    stage: checkpointStageValidator,
    status: benchmarkStatusValidator,
    currentStep: v.string(),
    eligibleCount: v.number(),
    completedCount: v.number(),
    readyCount: v.number(),
    completedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("runStageStates")
      .withIndex("by_run_and_stage", (q) => q.eq("runId", args.runId).eq("stage", args.stage))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        eligibleCount: args.eligibleCount,
        completedCount: args.completedCount,
        readyCount: args.readyCount,
        completedAt: args.completedAt,
      });
    } else {
      await ctx.db.insert("runStageStates", {
        runId: args.runId,
        stage: args.stage,
        status: args.status,
        eligibleCount: args.eligibleCount,
        completedCount: args.completedCount,
        readyCount: args.readyCount,
        startedAt: now,
        completedAt: args.completedAt,
      });
    }

    await ctx.db.patch(args.runId, {
      status: args.status,
      currentStep: args.currentStep,
      checkpointStage: args.stage,
      updatedAt: now,
    });
    const searchDoc = await ctx.db
      .query("runSearchDocs")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .unique();
    if (searchDoc) {
      await ctx.db.patch(searchDoc._id, { status: args.status });
    }

    await ctx.db.insert("runEvents", {
      runId: args.runId,
      stage: args.stage,
      kind: "stage_updated",
      participantModelId: undefined,
      message: args.currentStep,
      payload: {
        status: args.status,
        eligibleCount: args.eligibleCount,
        completedCount: args.completedCount,
        readyCount: args.readyCount,
      },
      createdAt: now,
    });
    return null;
  },
});

export const markParticipantStartedInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    participantId: v.id("runParticipants"),
    stage: checkpointStageValidator,
    startedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const participant = await ctx.db.get(args.participantId);
    if (!participant || participant.runId !== args.runId) {
      throw new ConvexError("Participant not found");
    }

    await ctx.db.patch(args.participantId, {
      stage: args.stage,
      status: "running",
      startedAt: args.startedAt,
      completedAt: undefined,
      error: undefined,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      stage: args.stage,
      kind: "model_started",
      participantModelId: participant.modelId,
      message: `${participant.modelName} started ${args.stage}`,
      createdAt: args.startedAt,
    });
    return null;
  },
});

export const recordParticipantStageSuccessInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    participantId: v.id("runParticipants"),
    stage: checkpointStageValidator,
    completedAt: v.number(),
    latencyMs: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    estimatedCostUsd: v.number(),
    parsedResult: v.any(),
    rawStorageId: v.optional(v.id("_storage")),
    rawSizeBytes: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const participant = await ctx.db.get(args.participantId);
    const run = await ctx.db.get(args.runId);
    if (!participant || participant.runId !== args.runId || !run) {
      throw new ConvexError("Participant not found");
    }

    let artifactId: Id<"runArtifacts"> | undefined;
    if (args.rawStorageId) {
      artifactId = await ctx.db.insert("runArtifacts", {
        runId: args.runId,
        participantModelId: participant.modelId,
        stage: args.stage,
        artifactType: "openrouter.raw",
        label: `${participant.modelName} ${args.stage} raw output`,
        storageId: args.rawStorageId,
        contentType: "text/plain",
        sizeBytes: args.rawSizeBytes,
        metadata: {
          participantId: args.participantId,
          stage: args.stage,
        },
        createdAt: args.completedAt,
      });
    }

    const stagePatch =
      args.stage === "generate"
        ? {
            generatedIdea: args.parsedResult,
            generatedRawArtifactId: artifactId,
          }
        : args.stage === "critique"
          ? {
              critiqueResult: args.parsedResult,
              critiqueRawArtifactId: artifactId,
            }
          : args.stage === "revise"
            ? {
                revisedIdea: args.parsedResult,
                revisedRawArtifactId: artifactId,
              }
            : {
                finalRanking: args.parsedResult,
                finalRawArtifactId: artifactId,
              };

    await ctx.db.patch(args.participantId, {
      ...stagePatch,
      stage: args.stage,
      status: "complete",
      completedAt: args.completedAt,
      latencyMs: args.latencyMs,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      estimatedCostUsd: args.estimatedCostUsd,
      error: undefined,
    });

    if ((args.inputTokens ?? 0) > 0 || (args.outputTokens ?? 0) > 0 || args.estimatedCostUsd > 0) {
      await ctx.db.insert("usageLedger", {
        runId: args.runId,
        organizationId: run.organizationId,
        projectId: run.projectId,
        participantModelId: participant.modelId,
        provider: "openrouter",
        stage: args.stage,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        estimatedCostUsd: args.estimatedCostUsd,
        createdAt: args.completedAt,
      });
    }

    const participants = await ctx.db
      .query("runParticipants")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    await ctx.db.patch(args.runId, {
      completedParticipantCount: participants.filter((entry) => entry.status === "complete").length,
      failedParticipantCount: participants.filter((entry) => entry.status === "failed").length,
      updatedAt: args.completedAt,
    });

    await ctx.db.insert("runEvents", {
      runId: args.runId,
      stage: args.stage,
      kind: "model_completed",
      participantModelId: participant.modelId,
      message: `${participant.modelName} completed ${args.stage}`,
      payload: {
        latencyMs: args.latencyMs,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        estimatedCostUsd: args.estimatedCostUsd,
      },
      createdAt: args.completedAt,
    });
    return null;
  },
});

export const recordParticipantStageFailureInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    participantId: v.id("runParticipants"),
    stage: checkpointStageValidator,
    completedAt: v.number(),
    message: v.string(),
    retryable: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const participant = await ctx.db.get(args.participantId);
    if (!participant || participant.runId !== args.runId) {
      throw new ConvexError("Participant not found");
    }

    await ctx.db.patch(args.participantId, {
      stage: args.stage,
      status: "failed",
      completedAt: args.completedAt,
      error: args.message,
    });

    const participants = await ctx.db
      .query("runParticipants")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    await ctx.db.patch(args.runId, {
      completedParticipantCount: participants.filter((entry) => entry.status === "complete").length,
      failedParticipantCount: participants.filter((entry) => entry.status === "failed").length,
      updatedAt: args.completedAt,
    });

    await ctx.db.insert("runEvents", {
      runId: args.runId,
      stage: args.stage,
      kind: "model_failed",
      participantModelId: participant.modelId,
      message: args.message,
      payload: {
        retryable: args.retryable,
      },
      createdAt: args.completedAt,
    });
    return null;
  },
});

async function finalizeBenchmarkJob(
  ctx: MutationCtx,
  args: {
    runId: Id<"runs">;
    status: Doc<"runs">["status"];
    completedAt: number;
    error?: string;
  },
) {
  const jobs = await ctx.db
    .query("jobs")
    .withIndex("by_run", (q) => q.eq("runId", args.runId))
    .collect();
  const job = jobs.find((entry) => entry.jobType === JOB_TYPES.benchmarkRun);
  if (!job) {
    return;
  }
  await finalizeJob(ctx, {
    jobId: job._id,
    status:
      args.status === "complete"
        ? JOB_STATUSES.complete
        : args.status === "canceled"
          ? JOB_STATUSES.canceled
          : args.status === "dead_lettered"
            ? JOB_STATUSES.deadLettered
            : JOB_STATUSES.failed,
    completedAt: args.completedAt,
    error: args.error,
    deadLetterReason:
      args.status === "dead_lettered"
        ? args.error ?? "Benchmark workflow exhausted retries and needs a manual restart."
        : undefined,
  });
}

export const finalizeRunOutcomeInternal = internalMutation({
  args: {
    runId: v.id("runs"),
    status: benchmarkStatusValidator,
    currentStep: v.string(),
    finalWinnerModelId: v.optional(v.string()),
    finalWinnerName: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }

    const participants = await ctx.db
      .query("runParticipants")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    await ctx.db.patch(args.runId, {
      status: args.status,
      currentStep: args.currentStep,
      finalWinnerModelId: args.finalWinnerModelId,
      finalWinnerName: args.finalWinnerName,
      error: args.error,
      completedParticipantCount: participants.filter((participant) => participant.status === "complete").length,
      failedParticipantCount: participants.filter((participant) => participant.status === "failed").length,
      updatedAt: now,
    });

    const searchDoc = await ctx.db
      .query("runSearchDocs")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .unique();
    if (searchDoc) {
      await ctx.db.patch(searchDoc._id, { status: args.status });
    }
    await settleRunAccountingAndStats(
      ctx,
      {
        ...run,
        status: args.status,
        currentStep: args.currentStep,
        finalWinnerModelId: args.finalWinnerModelId,
        finalWinnerName: args.finalWinnerName,
        error: args.error,
        completedParticipantCount: participants.filter((participant) => participant.status === "complete").length,
        failedParticipantCount: participants.filter((participant) => participant.status === "failed").length,
        updatedAt: now,
      },
      args.status,
      now,
    );

    await ctx.db.insert("runEvents", {
      runId: args.runId,
      stage: "complete",
      kind: "run_finalized",
      participantModelId: undefined,
      message: args.currentStep,
      payload: {
        status: args.status,
        finalWinnerModelId: args.finalWinnerModelId,
      },
      createdAt: now,
    });
    await finalizeBenchmarkJob(ctx, {
      runId: args.runId,
      status: args.status,
      completedAt: now,
      error: args.error,
    });
    if (args.status === "dead_lettered") {
      await recordValidationRepairJob(ctx, {
        run: {
          ...run,
          status: args.status,
          currentStep: args.currentStep,
          error: args.error,
          updatedAt: now,
        },
        createdAt: now,
        reason: args.error ?? args.currentStep,
      });
    }

    return null;
  },
});
