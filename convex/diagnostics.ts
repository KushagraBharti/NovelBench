import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuthUser, requireProjectAccess } from "./lib/auth";

export const getProjectDiagnostics = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const projectId = args.projectId ?? user.defaultProjectId;
    if (!projectId) {
      throw new ConvexError("No default project is configured");
    }

    await requireProjectAccess(ctx, projectId, "viewer");
    const project = await ctx.db.get(projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    const [recentRuns, recentJobs, budgets] = await Promise.all([
      ctx.db
        .query("runs")
        .withIndex("by_project_and_created_at", (q) => q.eq("projectId", projectId))
        .order("desc")
        .take(12),
      ctx.db
        .query("exports")
        .withIndex("by_project_and_created_at", (q) => q.eq("projectId", projectId))
        .order("desc")
        .take(12),
      ctx.db
        .query("usageBudgets")
        .withIndex("by_org_project_period", (q) =>
          q.eq("organizationId", project.organizationId).eq("projectId", projectId),
        )
        .collect(),
    ]);

    const benchmarkJobs = await ctx.db
      .query("jobs")
      .withIndex("by_run", (q) => q.eq("runId", recentRuns[0]?._id))
      .collect();
    const projectJobs = [
      ...benchmarkJobs,
      ...(await Promise.all(
        recentRuns.slice(1).map((run) =>
          ctx.db.query("jobs").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
        ),
      )).flat(),
    ];
    const recentProjectJobs = [...projectJobs]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);

    const usageDaily = [];
    for await (const entry of ctx.db
      .query("projectUsageDaily")
      .withIndex("by_project_and_day", (q) => q.eq("projectId", projectId))
      .order("desc")) {
      usageDaily.push(entry);
      if (usageDaily.length >= 30) {
        break;
      }
    }

    return {
      project: {
        id: project._id,
        name: project.name,
        visibility: project.visibility,
      },
      recentRuns: recentRuns.map((run) => ({
        id: run._id,
        status: run.status,
        currentStep: run.currentStep,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        participantCount: run.participantCount,
        completedParticipantCount: run.completedParticipantCount,
        failedParticipantCount: run.failedParticipantCount,
        settledCostUsd: run.settledCostUsd ?? 0,
      })),
      recentJobs: [
        ...recentProjectJobs.map((job) => ({
          id: job._id,
          jobType: job.jobType,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          updatedAt: job.updatedAt,
          deadlineAt: job.deadlineAt,
          lastError: job.lastError,
        })),
        ...recentJobs.map((entry) => ({
          id: entry._id,
          jobType: `export.${entry.scopeType ?? "run"}`,
          status: entry.status,
          attempts: 1,
          maxAttempts: 3,
          updatedAt: entry.updatedAt,
          deadlineAt: undefined,
          lastError: undefined,
        })),
      ]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20),
      budgets: budgets.map((budget) => ({
        period: budget.period,
        periodKey: budget.periodKey,
        reservedUsd: budget.reservedUsd,
        settledUsd: budget.settledUsd,
      })),
      usageDaily: usageDaily.map((entry) => ({
        dayKey: entry.dayKey,
        runCount: entry.runCount,
        settledCostUsd: entry.settledCostUsd,
      })),
    };
  },
});
