import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const modelSnapshot = v.object({
  id: v.string(),
  openRouterId: v.string(),
  name: v.string(),
  provider: v.string(),
  lab: v.string(),
  tier: v.string(),
  tags: v.array(v.string()),
  description: v.string(),
  personality: v.string(),
  color: v.string(),
  initial: v.string(),
  defaultEnabled: v.boolean(),
  active: v.boolean(),
  supportsToolCalling: v.optional(v.boolean()),
  pricing: v.optional(
    v.object({
      inputPerMillion: v.optional(v.number()),
      outputPerMillion: v.optional(v.number()),
      currency: v.optional(v.string()),
    }),
  ),
});

const exposureMode = v.union(
  v.literal("private"),
  v.literal("org_shared"),
  v.literal("public"),
  v.literal("public_full"),
);

const benchmarkStatus = v.union(
  v.literal("queued"),
  v.literal("paused"),
  v.literal("generating"),
  v.literal("critiquing"),
  v.literal("awaiting_human_critique"),
  v.literal("revising"),
  v.literal("voting"),
  v.literal("complete"),
  v.literal("partial"),
  v.literal("canceled"),
  v.literal("dead_lettered"),
  v.literal("error"),
);

const checkpointStage = v.union(
  v.literal("generate"),
  v.literal("critique"),
  v.literal("human_critique"),
  v.literal("revise"),
  v.literal("vote"),
  v.literal("complete"),
);

const modelExecutionStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("paused"),
  v.literal("retrying"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("canceled"),
  v.literal("skipped"),
);

const users = defineTable({
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  defaultOrgId: v.optional(v.id("organizations")),
  defaultProjectId: v.optional(v.id("projects")),
  onboardingComplete: v.optional(v.boolean()),
  lastSeenAt: v.optional(v.number()),
})
  .index("email", ["email"])
  .index("phone", ["phone"])
  .index("by_default_org", ["defaultOrgId"]);

export default defineSchema({
  users,
  authSessions: authTables.authSessions,
  authAccounts: authTables.authAccounts,
  authRefreshTokens: authTables.authRefreshTokens,
  authVerificationCodes: authTables.authVerificationCodes,
  authVerifiers: authTables.authVerifiers,
  authRateLimits: authTables.authRateLimits,

  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    kind: v.union(v.literal("personal"), v.literal("workspace")),
    ownerUserId: v.id("users"),
    createdByUserId: v.id("users"),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner_user", ["ownerUserId"])
    .index("by_slug", ["slug"]),

  organizationMembers: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_organization_and_user", ["organizationId", "userId"])
    .index("by_user", ["userId"]),

  projects: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    slug: v.string(),
    visibility: exposureMode,
    createdByUserId: v.id("users"),
    archivedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_slug", ["organizationId", "slug"]),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    joinedAt: v.number(),
  })
    .index("by_project_and_user", ["projectId", "userId"])
    .index("by_user", ["userId"]),

  providerVaultEntries: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("openrouter"), v.literal("exa")),
    ciphertext: v.string(),
    iv: v.string(),
    wrappedDek: v.string(),
    fingerprint: v.string(),
    keyVersion: v.string(),
    lastValidatedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_and_provider", ["userId", "provider"]),

  providerPolicies: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    allowedModelIds: v.optional(v.array(v.string())),
    maxModelsPerRun: v.number(),
    maxConcurrentRuns: v.number(),
    dailySpendLimitUsd: v.optional(v.number()),
    monthlySpendLimitUsd: v.optional(v.number()),
    researchEnabled: v.boolean(),
    hardBlockOnBudget: v.boolean(),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_project", ["organizationId", "projectId"]),

  usageBudgets: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    period: v.union(v.literal("day"), v.literal("month")),
    periodKey: v.string(),
    reservedUsd: v.number(),
    settledUsd: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_project_period", ["organizationId", "projectId", "period", "periodKey"]),

  rateLimitBuckets: defineTable({
    scopeType: v.union(v.literal("user"), v.literal("project")),
    scopeId: v.string(),
    bucketKey: v.string(),
    window: v.union(v.literal("hour"), v.literal("day")),
    limit: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_type_and_scope_id_and_bucket_key", ["scopeType", "scopeId", "bucketKey"]),

  usageLedger: defineTable({
    runId: v.optional(v.id("runs")),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    participantModelId: v.optional(v.string()),
    provider: v.union(v.literal("openrouter"), v.literal("exa")),
    stage: checkpointStage,
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    estimatedCostUsd: v.number(),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_project_and_created_at", ["projectId", "createdAt"]),

  auditLogs: defineTable({
    actorUserId: v.id("users"),
    organizationId: v.optional(v.id("organizations")),
    projectId: v.optional(v.id("projects")),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_actor_and_created_at", ["actorUserId", "createdAt"])
    .index("by_resource", ["resourceType", "resourceId"]),

  runs: defineTable({
    legacyRunId: v.optional(v.string()),
    ownerUserId: v.id("users"),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    categoryId: v.string(),
    prompt: v.string(),
    promptExcerpt: v.string(),
    selectedModels: v.array(modelSnapshot),
    status: benchmarkStatus,
    currentStep: v.string(),
    checkpointStage,
    visibility: exposureMode,
    workflowId: v.optional(v.string()),
    participantCount: v.number(),
    minimumSuccessfulModels: v.number(),
    completedParticipantCount: v.number(),
    failedParticipantCount: v.number(),
    pauseRequested: v.boolean(),
    cancellationRequested: v.boolean(),
    error: v.optional(v.string()),
    finalWinnerModelId: v.optional(v.string()),
    finalWinnerName: v.optional(v.string()),
    promptCaptureCount: v.number(),
    exportCount: v.number(),
    reservedBudgetUsd: v.optional(v.number()),
    settledCostUsd: v.optional(v.number()),
    budgetSettledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_legacy_run_id", ["legacyRunId"])
    .index("by_project_and_created_at", ["projectId", "createdAt"])
    .index("by_project_and_status_and_created_at", ["projectId", "status", "createdAt"])
    .index("by_org_and_created_at", ["organizationId", "createdAt"])
    .index("by_created_at", ["createdAt"])
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_visibility_and_created_at", ["visibility", "createdAt"])
    .index("by_category_and_created_at", ["categoryId", "createdAt"]),

  runParticipants: defineTable({
    runId: v.id("runs"),
    order: v.number(),
    modelId: v.string(),
    openRouterId: v.string(),
    modelName: v.string(),
    stage: checkpointStage,
    status: modelExecutionStatus,
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    error: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    estimatedCostUsd: v.number(),
    generatedIdea: v.optional(v.any()),
    generatedRawArtifactId: v.optional(v.id("runArtifacts")),
    critiqueResult: v.optional(v.any()),
    critiqueRawArtifactId: v.optional(v.id("runArtifacts")),
    revisedIdea: v.optional(v.any()),
    revisedRawArtifactId: v.optional(v.id("runArtifacts")),
    finalRanking: v.optional(v.any()),
    finalRawArtifactId: v.optional(v.id("runArtifacts")),
  })
    .index("by_run", ["runId"])
    .index("by_run_and_model_id", ["runId", "modelId"]),

  runStageStates: defineTable({
    runId: v.id("runs"),
    stage: checkpointStage,
    status: benchmarkStatus,
    eligibleCount: v.number(),
    completedCount: v.number(),
    readyCount: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_run_and_stage", ["runId", "stage"]),

  runEvents: defineTable({
    runId: v.id("runs"),
    stage: checkpointStage,
    kind: v.string(),
    participantModelId: v.optional(v.string()),
    message: v.string(),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_run_and_created_at", ["runId", "createdAt"])
    .index("by_run_stage_and_created_at", ["runId", "stage", "createdAt"])
    .index("by_run_kind_and_created_at", ["runId", "kind", "createdAt"])
    .index("by_run_stage_kind_and_created_at", ["runId", "stage", "kind", "createdAt"]),

  runArtifacts: defineTable({
    runId: v.id("runs"),
    participantModelId: v.optional(v.string()),
    stage: checkpointStage,
    artifactType: v.string(),
    label: v.string(),
    storageId: v.optional(v.id("_storage")),
    contentType: v.string(),
    sizeBytes: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_and_stage", ["runId", "stage"]),

  jobs: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    runId: v.optional(v.id("runs")),
    jobType: v.string(),
    idempotencyKey: v.string(),
    status: v.string(),
    attempts: v.number(),
    maxAttempts: v.number(),
    deadlineAt: v.optional(v.number()),
    workId: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    deadLetterReason: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_run", ["runId"])
    .index("by_status", ["status"]),

  jobAttempts: defineTable({
    jobId: v.id("jobs"),
    attemptNumber: v.number(),
    status: v.string(),
    error: v.optional(v.string()),
    deadlineAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  }).index("by_job", ["jobId"]),

  runSearchDocs: defineTable({
    runId: v.id("runs"),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    categoryId: v.string(),
    status: benchmarkStatus,
    visibility: exposureMode,
    promptSearchText: v.string(),
    promptExcerpt: v.string(),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_created_at", ["createdAt"])
    .index("by_org_and_created_at", ["organizationId", "createdAt"])
    .index("by_project_and_created_at", ["projectId", "createdAt"])
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_visibility_and_created_at", ["visibility", "createdAt"])
    .index("by_category_and_created_at", ["categoryId", "createdAt"])
    .searchIndex("search_prompt", {
      searchField: "promptSearchText",
      filterFields: ["organizationId", "projectId", "categoryId", "status", "visibility"],
    }),

  leaderboardSnapshots: defineTable({
    snapshotKey: v.string(),
    scopeType: v.union(v.literal("global"), v.literal("category")),
    scopeValue: v.optional(v.string()),
    entries: v.array(v.any()),
    totals: v.object({
      runs: v.number(),
      ideas: v.number(),
      critiques: v.number(),
      completedModels: v.number(),
    }),
    updatedAt: v.number(),
  }).index("by_snapshot_key", ["snapshotKey"]),

  categoryStatsDaily: defineTable({
    categoryId: v.string(),
    dayKey: v.string(),
    runs: v.number(),
    completedRuns: v.number(),
    partialRuns: v.number(),
    updatedAt: v.number(),
  }).index("by_category_and_day", ["categoryId", "dayKey"]),

  modelStatsDaily: defineTable({
    modelId: v.string(),
    dayKey: v.string(),
    wins: v.number(),
    runs: v.number(),
    averageFinalScore: v.number(),
    averageFinalRank: v.number(),
    updatedAt: v.number(),
  }).index("by_model_and_day", ["modelId", "dayKey"]),

  projectUsageDaily: defineTable({
    projectId: v.id("projects"),
    dayKey: v.string(),
    runCount: v.number(),
    settledCostUsd: v.number(),
    updatedAt: v.number(),
  }).index("by_project_and_day", ["projectId", "dayKey"]),

  exports: defineTable({
    runId: v.optional(v.id("runs")),
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    requestedByUserId: v.id("users"),
    scopeType: v.optional(
      v.union(v.literal("run"), v.literal("project_summary"), v.literal("leaderboard")),
    ),
    scopeKey: v.optional(v.string()),
    categoryId: v.optional(v.string()),
    format: v.union(v.literal("json"), v.literal("csv")),
    status: v.string(),
    artifactId: v.optional(v.id("runArtifacts")),
    storageId: v.optional(v.id("_storage")),
    label: v.optional(v.string()),
    contentType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_requester", ["requestedByUserId"])
    .index("by_project_and_created_at", ["projectId", "createdAt"])
    .index("by_scope_type_and_created_at", ["scopeType", "createdAt"])
    .index("by_scope_type_and_scope_key_and_created_at", ["scopeType", "scopeKey", "createdAt"]),
});
