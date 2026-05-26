import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { BenchmarkRun, CritiqueVoteResult, Ranking } from "@/types";
import { buildPromptExcerpt, buildRunSearchText, dayKeyFromTimestamp } from "./lib/runHelpers";
import { slugify } from "./lib/auth";

const LEGACY_IMPORT_USER_EMAIL = "legacy-import@novelbench.local";
const LEGACY_IMPORT_USER_NAME = "Legacy Import";
const LEGACY_IMPORT_ORG_NAME = "Legacy Import Workspace";
const LEGACY_IMPORT_ORG_SLUG = slugify("legacy-import");
const LEGACY_IMPORT_PROJECT_NAME = "Legacy Archive";
const LEGACY_IMPORT_PROJECT_SLUG = slugify("legacy-archive");
const MIN_CONCURRENT_RUNS = 5;

function inferFinalWinner(run: BenchmarkRun) {
  const stats = new Map<string, { rankTotal: number; scoreTotal: number; count: number }>();
  for (const ranking of run.finalRankings) {
    for (const entry of ranking.rankings) {
      const current = stats.get(entry.modelId) ?? { rankTotal: 0, scoreTotal: 0, count: 0 };
      current.rankTotal += entry.rank;
      current.scoreTotal += entry.score;
      current.count += 1;
      stats.set(entry.modelId, current);
    }
  }

  let winnerId: string | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [modelId, current] of stats) {
    const averageRank = current.rankTotal / current.count;
    const averageScore = current.scoreTotal / current.count;
    if (averageRank < bestRank || (averageRank === bestRank && averageScore > bestScore)) {
      winnerId = modelId;
      bestRank = averageRank;
      bestScore = averageScore;
    }
  }

  if (!winnerId) {
    return { modelId: undefined, modelName: undefined };
  }

  return {
    modelId: winnerId,
    modelName: run.selectedModels.find((entry) => entry.id === winnerId)?.name,
  };
}

export const ensureLegacyImportTargetInternal = internalMutation({
  args: {},
  returns: v.object({
    ownerUserId: v.id("users"),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
  }),
  handler: async (ctx) => {
    const now = Date.now();

    let user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", LEGACY_IMPORT_USER_EMAIL))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        name: LEGACY_IMPORT_USER_NAME,
        email: LEGACY_IMPORT_USER_EMAIL,
        isAnonymous: false,
        onboardingComplete: true,
        lastSeenAt: now,
      });
      user = await ctx.db.get(userId);
      if (!user) {
        throw new ConvexError("Failed to create legacy import user");
      }
    }

    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", LEGACY_IMPORT_ORG_SLUG))
      .unique();

    if (!organization) {
      const organizationId = await ctx.db.insert("organizations", {
        name: LEGACY_IMPORT_ORG_NAME,
        slug: LEGACY_IMPORT_ORG_SLUG,
        kind: "workspace",
        ownerUserId: user._id,
        createdByUserId: user._id,
      });
      organization = await ctx.db.get(organizationId);
      if (!organization) {
        throw new ConvexError("Failed to create legacy import organization");
      }
    }

    const orgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_and_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", user._id),
      )
      .unique();

    if (!orgMembership) {
      await ctx.db.insert("organizationMembers", {
        organizationId: organization._id,
        userId: user._id,
        role: "owner",
        joinedAt: now,
      });
    }

    let project = await ctx.db
      .query("projects")
      .withIndex("by_organization_and_slug", (q) =>
        q.eq("organizationId", organization._id).eq("slug", LEGACY_IMPORT_PROJECT_SLUG),
      )
      .unique();

    if (!project) {
      const projectId = await ctx.db.insert("projects", {
        organizationId: organization._id,
        name: LEGACY_IMPORT_PROJECT_NAME,
        slug: LEGACY_IMPORT_PROJECT_SLUG,
        visibility: "public_full",
        createdByUserId: user._id,
      });
      project = await ctx.db.get(projectId);
      if (!project) {
        throw new ConvexError("Failed to create legacy import project");
      }
    }

    const projectMembership = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", project._id).eq("userId", user._id),
      )
      .unique();

    if (!projectMembership) {
      await ctx.db.insert("projectMembers", {
        projectId: project._id,
        userId: user._id,
        role: "editor",
        joinedAt: now,
      });
    }

    const existingPolicy = await ctx.db
      .query("providerPolicies")
      .withIndex("by_organization_and_project", (q) =>
        q.eq("organizationId", organization._id).eq("projectId", project._id),
      )
      .unique();

    if (!existingPolicy) {
      await ctx.db.insert("providerPolicies", {
        organizationId: organization._id,
        projectId: project._id,
        maxModelsPerRun: 8,
        maxConcurrentRuns: MIN_CONCURRENT_RUNS,
        researchEnabled: true,
        hardBlockOnBudget: true,
        updatedByUserId: user._id,
        updatedAt: now,
      });
    }

    await ctx.db.patch(user._id, {
      defaultOrgId: organization._id,
      defaultProjectId: project._id,
      onboardingComplete: true,
      lastSeenAt: now,
    });

    return {
      ownerUserId: user._id,
      organizationId: organization._id,
      projectId: project._id,
    };
  },
});

export const importLegacyRunInternal = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    legacyRunId: v.string(),
    run: v.any(),
    promptCaptureStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("runs"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("runs")
      .withIndex("by_legacy_run_id", (q) => q.eq("legacyRunId", args.legacyRunId))
      .unique();
    if (existing) {
      return existing._id;
    }

    const run = args.run as BenchmarkRun;
    const humanCritiques = Array.isArray(run.humanCritiques) ? run.humanCritiques : [];
    const failures = Array.isArray(run.failures) ? run.failures : [];
    const controlHistory = Array.isArray(run.controls?.history) ? run.controls.history : [];
    const createdAt = Number.isFinite(Date.parse(run.timestamp)) ? Date.parse(run.timestamp) : Date.now();
    const updatedAt = Number.isFinite(Date.parse(run.updatedAt)) ? Date.parse(run.updatedAt) : createdAt;
    const finalWinner = inferFinalWinner(run);

    const runId = await ctx.db.insert("runs", {
      legacyRunId: args.legacyRunId,
      ownerUserId: args.ownerUserId,
      organizationId: args.organizationId,
      projectId: args.projectId,
      categoryId: run.categoryId,
      prompt: run.prompt,
      promptExcerpt: buildPromptExcerpt(run.prompt),
      selectedModels: run.selectedModels,
      status: run.status,
      currentStep: run.currentStep,
      checkpointStage: run.checkpoint.stage,
      visibility: run.exposureMode,
      workflowId: undefined,
      participantCount: run.metadata.participantCount,
      minimumSuccessfulModels: run.metadata.minimumSuccessfulModels,
      completedParticipantCount: run.finalRankings.length,
      failedParticipantCount: run.failedModels.length,
      humanCritiqueCount: humanCritiques.length,
      pauseRequested: run.status === "paused",
      cancellationRequested: run.cancellation.requested,
      error: run.error,
      finalWinnerModelId: finalWinner.modelId,
      finalWinnerName: finalWinner.modelName,
      promptCaptureCount: args.promptCaptureStorageId ? 1 : 0,
      exportCount: 0,
      reservedBudgetUsd: 0,
      settledCostUsd: 0,
      budgetSettledAt: createdAt,
      createdAt,
      updatedAt,
    });

    for (const [index, model] of run.selectedModels.entries()) {
      const critique = run.critiqueVotes.find(
        (entry: CritiqueVoteResult) => entry.fromModelId === model.id,
      );
      const finalRanking = run.finalRankings.find(
        (entry: Ranking) => entry.judgeModelId === model.id,
      );
      const state = run.modelStates[model.id];
      await ctx.db.insert("runParticipants", {
        runId,
        order: index,
        modelId: model.id,
        openRouterId: model.openRouterId,
        modelName: model.name,
        stage: state?.stage ?? run.checkpoint.stage,
        status: state?.status ?? (run.failedModels.includes(model.id) ? "failed" : "complete"),
        startedAt: state?.startedAt ? Date.parse(state.startedAt) : undefined,
        completedAt: state?.completedAt ? Date.parse(state.completedAt) : undefined,
        latencyMs: undefined,
        error: state?.error,
        inputTokens: undefined,
        outputTokens: undefined,
        estimatedCostUsd: 0,
        generatedIdea: run.ideas.find((entry) => entry.modelId === model.id)?.content,
        generatedRawArtifactId: undefined,
        critiqueResult: critique,
        critiqueRawArtifactId: undefined,
        revisedIdea: run.revisedIdeas.find((entry) => entry.modelId === model.id)?.content,
        revisedRawArtifactId: undefined,
        finalRanking,
        finalRawArtifactId: undefined,
      });
    }

    await ctx.db.insert("runStageStates", {
      runId,
      stage: run.checkpoint.stage,
      status: run.status,
      eligibleCount: run.metadata.participantCount,
      completedCount: run.checkpoint.completedModelIds.length,
      readyCount: run.checkpoint.readyForRevisionModelIds.length,
      startedAt: createdAt,
      completedAt: updatedAt,
    });

    await ctx.db.insert("runSearchDocs", {
      runId,
      organizationId: args.organizationId,
      projectId: args.projectId,
      categoryId: run.categoryId,
      status: run.status,
      visibility: run.exposureMode,
      promptSearchText: buildRunSearchText(run.prompt),
      promptExcerpt: buildPromptExcerpt(run.prompt),
      createdAt,
    });

    for (const [index, critique] of humanCritiques.entries()) {
      await ctx.db.insert("runHumanCritiques", {
        runId,
        targetModelId: critique.targetModelId,
        critiqueId: critique.id || `legacy:${args.legacyRunId}:human:${index}`,
        ideaLabel: critique.ideaLabel,
        strengths: critique.strengths,
        weaknesses: critique.weaknesses,
        suggestions: critique.suggestions,
        score: critique.score,
        authorLabel: critique.authorLabel,
        createdAt: Date.parse(critique.timestamp) || updatedAt,
        sourceIndex: index,
      });
    }

    for (const failure of failures) {
      await ctx.db.insert("runFailures", {
        runId,
        stage: failure.stage,
        participantModelId: failure.modelId,
        message: failure.message,
        retryable: failure.retryable,
        createdAt: Date.parse(failure.timestamp) || updatedAt,
      });
    }

    for (const event of controlHistory) {
      await ctx.db.insert("runControlEvents", {
        runId,
        stage: event.stage,
        action: event.action,
        scope: event.scope,
        actor: event.actor,
        participantModelId: event.modelId,
        reason: event.reason ?? `${event.action} imported from legacy history`,
        createdAt: Date.parse(event.timestamp) || updatedAt,
      });
    }

    if (args.promptCaptureStorageId) {
      await ctx.db.insert("runArtifacts", {
        runId,
        participantModelId: undefined,
        stage: "complete",
        artifactType: "prompt_capture.jsonl",
        label: "Legacy prompt captures",
        storageId: args.promptCaptureStorageId,
        contentType: "application/x-ndjson",
        sizeBytes: undefined,
        metadata: {
          legacyRunId: args.legacyRunId,
        },
        createdAt: updatedAt,
      });
    }

    const dayKey = dayKeyFromTimestamp(createdAt);
    const usageDaily = await ctx.db
      .query("projectUsageDaily")
      .withIndex("by_project_and_day", (q) => q.eq("projectId", args.projectId).eq("dayKey", dayKey))
      .unique();
    if (usageDaily) {
      await ctx.db.patch(usageDaily._id, {
        runCount: usageDaily.runCount + 1,
        updatedAt,
      });
    } else {
      await ctx.db.insert("projectUsageDaily", {
        projectId: args.projectId,
        dayKey,
        runCount: 1,
        settledCostUsd: 0,
        updatedAt,
      });
    }

    const categoryStats = await ctx.db
      .query("categoryStatsDaily")
      .withIndex("by_category_and_day", (q) => q.eq("categoryId", run.categoryId).eq("dayKey", dayKey))
      .unique();
    if (categoryStats) {
      await ctx.db.patch(categoryStats._id, {
        runs: categoryStats.runs + 1,
        completedRuns: categoryStats.completedRuns + (run.status === "complete" ? 1 : 0),
        partialRuns:
          categoryStats.partialRuns +
          (run.status === "partial" || run.status === "dead_lettered" ? 1 : 0),
        updatedAt,
      });
    } else {
      await ctx.db.insert("categoryStatsDaily", {
        categoryId: run.categoryId,
        dayKey,
        runs: 1,
        completedRuns: run.status === "complete" ? 1 : 0,
        partialRuns: run.status === "partial" || run.status === "dead_lettered" ? 1 : 0,
        updatedAt,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: args.ownerUserId,
      organizationId: args.organizationId,
      projectId: args.projectId,
      action: "migration.legacy_run_imported",
      resourceType: "run",
      resourceId: String(runId),
      metadata: {
        legacyRunId: args.legacyRunId,
      },
      createdAt: updatedAt,
    });

    return runId;
  },
});
