import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const JOB_STATUSES = {
  queued: "queued",
  running: "running",
  complete: "complete",
  failed: "failed",
  canceled: "canceled",
  deadLettered: "dead_lettered",
} as const;

export const JOB_TYPES = {
  benchmarkRun: "benchmark.run",
  exportRun: "export.run",
  exportProjectSummary: "export.project_summary",
  exportLeaderboard: "export.leaderboard",
  validationRunRepair: "validation.run_repair",
  researchPreflight: "research.preflight",
} as const;

type JobStatus = (typeof JOB_STATUSES)[keyof typeof JOB_STATUSES];
type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export async function createQueuedJob(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId?: Id<"projects">;
    runId?: Id<"runs">;
    jobType: JobType;
    idempotencyKey: string;
    maxAttempts: number;
    deadlineAt?: number;
    createdByUserId: Id<"users">;
    metadata?: Record<string, unknown>;
  },
) {
  const existing = await ctx.db
    .query("jobs")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();
  if (existing) {
    return existing._id;
  }

  return await ctx.db.insert("jobs", {
    organizationId: args.organizationId,
    projectId: args.projectId,
    runId: args.runId,
    jobType: args.jobType,
    idempotencyKey: args.idempotencyKey,
    status: JOB_STATUSES.queued,
    attempts: 0,
    maxAttempts: args.maxAttempts,
    deadlineAt: args.deadlineAt,
    workId: undefined,
    workflowId: undefined,
    lastError: undefined,
    deadLetterReason: undefined,
    metadata: args.metadata,
    createdByUserId: args.createdByUserId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function startJobAttempt(
  ctx: MutationCtx,
  args: {
    jobId: Id<"jobs">;
    workId?: string;
    workflowId?: string;
    startedAt?: number;
    metadata?: Record<string, unknown>;
  },
) {
  const job = await ctx.db.get(args.jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  const startedAt = args.startedAt ?? Date.now();
  const attemptNumber = job.attempts + 1;
  await ctx.db.patch(job._id, {
    status: JOB_STATUSES.running,
    attempts: attemptNumber,
    workId: args.workId ?? job.workId,
    workflowId: args.workflowId ?? job.workflowId,
    lastError: undefined,
    deadLetterReason: undefined,
    updatedAt: startedAt,
  });
  await ctx.db.insert("jobAttempts", {
    jobId: job._id,
    attemptNumber,
    status: JOB_STATUSES.running,
    error: undefined,
    deadlineAt: job.deadlineAt,
    metadata: args.metadata,
    startedAt,
    completedAt: undefined,
    durationMs: undefined,
  });
}

export async function finalizeJob(
  ctx: MutationCtx,
  args: {
    jobId: Id<"jobs">;
    status: JobStatus;
    completedAt?: number;
    error?: string;
    deadLetterReason?: string;
  },
) {
  const job = await ctx.db.get(args.jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  const completedAt = args.completedAt ?? Date.now();
  await ctx.db.patch(job._id, {
    status: args.status,
    lastError: args.error,
    deadLetterReason: args.deadLetterReason,
    updatedAt: completedAt,
  });

  const attempts = await ctx.db
    .query("jobAttempts")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .collect();
  const latestAttempt = attempts.sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  if (!latestAttempt) {
    return;
  }

  await ctx.db.patch(latestAttempt._id, {
    status: args.status,
    error: args.error,
    completedAt,
    durationMs: completedAt - latestAttempt.startedAt,
  });
}

export async function getJobByIdempotencyKey(
  ctx: MutationCtx,
  idempotencyKey: string,
) {
  return await ctx.db
    .query("jobs")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
}

export function isActiveJob(job: Pick<Doc<"jobs">, "status"> | null | undefined) {
  return job?.status === JOB_STATUSES.queued || job?.status === JOB_STATUSES.running;
}
