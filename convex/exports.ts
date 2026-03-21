import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { exportsWorkpool } from "./workflow";
import { requireAuthUser, requireProjectAccess } from "./lib/auth";
import {
  createQueuedJob,
  finalizeJob,
  JOB_STATUSES,
  JOB_TYPES,
  startJobAttempt,
} from "./lib/jobs";

const exportFormatValidator = v.union(v.literal("json"), v.literal("csv"));
const exportScopeTypeValidator = v.union(
  v.literal("run"),
  v.literal("project_summary"),
  v.literal("leaderboard"),
);

function toExportView(
  artifact: Doc<"runArtifacts"> | null,
  exportDoc: Doc<"exports">,
  downloadUrl: string | null,
) {
  return {
    id: exportDoc._id,
    scopeType: exportDoc.scopeType ?? "run",
    scopeKey: exportDoc.scopeKey ?? null,
    categoryId: exportDoc.categoryId ?? null,
    format: exportDoc.format,
    status: exportDoc.status,
    createdAt: exportDoc.createdAt,
    updatedAt: exportDoc.updatedAt,
    artifactId: exportDoc.artifactId,
    downloadUrl,
    artifactLabel: artifact?.label ?? exportDoc.label ?? null,
  };
}

export const listByRun = query({
  args: {
    runId: v.id("runs"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    if (run.visibility !== "public" && run.visibility !== "public_full") {
      await requireProjectAccess(ctx, run.projectId, "viewer");
    }

    const exports = await ctx.db
      .query("exports")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .order("desc")
      .take(20);

    return await Promise.all(
      exports.map(async (entry) => {
        const artifact = entry.artifactId ? await ctx.db.get(entry.artifactId) : null;
        const downloadUrl = artifact?.storageId
          ? await ctx.storage.getUrl(artifact.storageId)
          : entry.storageId
            ? await ctx.storage.getUrl(entry.storageId)
            : null;
        return toExportView(artifact, entry, downloadUrl);
      }),
    );
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "viewer");
    const exports = await ctx.db
      .query("exports")
      .withIndex("by_project_and_created_at", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(20);

    return await Promise.all(
      exports
        .filter((entry) => entry.scopeType === "project_summary")
        .map(async (entry) => {
          const artifact = entry.artifactId ? await ctx.db.get(entry.artifactId) : null;
          const downloadUrl = artifact?.storageId
            ? await ctx.storage.getUrl(artifact.storageId)
            : entry.storageId
              ? await ctx.storage.getUrl(entry.storageId)
              : null;
          return toExportView(artifact, entry, downloadUrl);
        }),
    );
  },
});

export const listLeaderboard = query({
  args: {
    categoryId: v.optional(v.string()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const scopeKey = args.categoryId ? `category:${args.categoryId}` : "global";
    const exports = await ctx.db
      .query("exports")
      .withIndex("by_scope_type_and_scope_key_and_created_at", (q) =>
        q.eq("scopeType", "leaderboard").eq("scopeKey", scopeKey),
      )
      .order("desc")
      .take(20);

    return await Promise.all(
      exports.map(async (entry) => {
        const artifact = entry.artifactId ? await ctx.db.get(entry.artifactId) : null;
        const downloadUrl = artifact?.storageId
          ? await ctx.storage.getUrl(artifact.storageId)
          : entry.storageId
            ? await ctx.storage.getUrl(entry.storageId)
            : null;
        return toExportView(artifact, entry, downloadUrl);
      }),
    );
  },
});

export const requestRunExport = mutation({
  args: {
    runId: v.id("runs"),
    format: exportFormatValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError("Run not found");
    }
    await requireProjectAccess(ctx, run.projectId, "viewer");

    const existing = await ctx.db
      .query("exports")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    const reusable = existing.find(
      (entry) =>
        entry.requestedByUserId === user._id &&
        entry.format === args.format &&
        ["queued", "running", "complete"].includes(entry.status),
    );
    if (reusable) {
      const artifact = reusable.artifactId ? await ctx.db.get(reusable.artifactId) : null;
      const downloadUrl = artifact?.storageId ? await ctx.storage.getUrl(artifact.storageId) : null;
      return toExportView(artifact, reusable, downloadUrl);
    }

    const now = Date.now();
    const exportId = await ctx.db.insert("exports", {
      runId: args.runId,
      organizationId: run.organizationId,
      projectId: run.projectId,
      requestedByUserId: user._id,
      scopeType: "run",
      scopeKey: String(args.runId),
      categoryId: run.categoryId,
      format: args.format,
      status: "queued",
      artifactId: undefined,
      createdAt: now,
      updatedAt: now,
    });
    const jobId = await createQueuedJob(ctx, {
      organizationId: run.organizationId,
      projectId: run.projectId,
      runId: run._id,
      jobType: JOB_TYPES.exportRun,
      idempotencyKey: `export:${run._id}:${args.format}:${user._id}`,
      maxAttempts: 3,
      deadlineAt: now + 1000 * 60 * 10,
      createdByUserId: user._id,
      metadata: {
        exportId,
        format: args.format,
        scopeType: "run",
      },
    });

    const workId = await exportsWorkpool.enqueueAction(
      ctx,
      internal.exportActions.generateExportFile,
      { exportId },
      {
        retry: true,
        onComplete: internal.exports.handleExportCompletionInternal,
        context: {
          exportId,
          jobId,
        },
      },
    );

    await ctx.db.patch(exportId, {
      status: "running",
      updatedAt: Date.now(),
    });
    await startJobAttempt(ctx, {
      jobId,
      workId,
      startedAt: now,
      metadata: {
        exportId,
      },
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      action: "export.requested",
      resourceType: "export",
      resourceId: String(exportId),
      metadata: {
        format: args.format,
        runId: run._id,
      },
      createdAt: now,
    });

    const exportDoc = await ctx.db.get(exportId);
    return toExportView(null, exportDoc!, null);
  },
});

export const requestProjectSummaryExport = mutation({
  args: {
    projectId: v.id("projects"),
    format: exportFormatValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }
    await requireProjectAccess(ctx, args.projectId, "viewer");

    const existing = await ctx.db
      .query("exports")
      .withIndex("by_project_and_created_at", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(20);
    const reusable = existing.find(
      (entry) =>
        entry.scopeType === "project_summary" &&
        entry.requestedByUserId === user._id &&
        entry.format === args.format &&
        ["queued", "running", "complete"].includes(entry.status),
    );
    if (reusable) {
      const artifact = reusable.artifactId ? await ctx.db.get(reusable.artifactId) : null;
      const downloadUrl = artifact?.storageId
        ? await ctx.storage.getUrl(artifact.storageId)
        : reusable.storageId
          ? await ctx.storage.getUrl(reusable.storageId)
          : null;
      return toExportView(artifact, reusable, downloadUrl);
    }

    const now = Date.now();
    const scopeKey = String(args.projectId);
    const exportId = await ctx.db.insert("exports", {
      runId: undefined,
      organizationId: project.organizationId,
      projectId: project._id,
      requestedByUserId: user._id,
      scopeType: "project_summary",
      scopeKey,
      categoryId: undefined,
      format: args.format,
      status: "queued",
      artifactId: undefined,
      createdAt: now,
      updatedAt: now,
    });
    const jobId = await createQueuedJob(ctx, {
      organizationId: project.organizationId,
      projectId: project._id,
      runId: undefined,
      jobType: JOB_TYPES.exportProjectSummary,
      idempotencyKey: `export:project_summary:${project._id}:${args.format}:${user._id}`,
      maxAttempts: 3,
      deadlineAt: now + 1000 * 60 * 10,
      createdByUserId: user._id,
      metadata: {
        exportId,
        format: args.format,
        scopeType: "project_summary",
      },
    });

    const workId = await exportsWorkpool.enqueueAction(
      ctx,
      internal.exportActions.generateExportFile,
      { exportId },
      {
        retry: true,
        onComplete: internal.exports.handleExportCompletionInternal,
        context: {
          exportId,
          jobId,
        },
      },
    );

    await ctx.db.patch(exportId, { status: "running", updatedAt: now });
    await startJobAttempt(ctx, {
      jobId,
      workId,
      startedAt: now,
      metadata: {
        exportId,
      },
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: project.organizationId,
      projectId: project._id,
      action: "export.project_summary.requested",
      resourceType: "export",
      resourceId: String(exportId),
      metadata: {
        format: args.format,
        projectId: project._id,
      },
      createdAt: now,
    });

    const exportDoc = await ctx.db.get(exportId);
    return toExportView(null, exportDoc!, null);
  },
});

export const requestLeaderboardExport = mutation({
  args: {
    format: exportFormatValidator,
    categoryId: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    if (!user.defaultOrgId) {
      throw new ConvexError("No default organization is configured");
    }

    const scopeKey = args.categoryId ? `category:${args.categoryId}` : "global";
    const existing = await ctx.db
      .query("exports")
      .withIndex("by_scope_type_and_scope_key_and_created_at", (q) =>
        q.eq("scopeType", "leaderboard").eq("scopeKey", scopeKey),
      )
      .order("desc")
      .take(20);
    const reusable = existing.find(
      (entry) =>
        entry.requestedByUserId === user._id &&
        entry.format === args.format &&
        ["queued", "running", "complete"].includes(entry.status),
    );
    if (reusable) {
      const artifact = reusable.artifactId ? await ctx.db.get(reusable.artifactId) : null;
      const downloadUrl = artifact?.storageId
        ? await ctx.storage.getUrl(artifact.storageId)
        : reusable.storageId
          ? await ctx.storage.getUrl(reusable.storageId)
          : null;
      return toExportView(artifact, reusable, downloadUrl);
    }

    const now = Date.now();
    const exportId = await ctx.db.insert("exports", {
      runId: undefined,
      organizationId: user.defaultOrgId,
      projectId: undefined,
      requestedByUserId: user._id,
      scopeType: "leaderboard",
      scopeKey,
      categoryId: args.categoryId,
      format: args.format,
      status: "queued",
      artifactId: undefined,
      createdAt: now,
      updatedAt: now,
    });
    const jobId = await createQueuedJob(ctx, {
      organizationId: user.defaultOrgId,
      projectId: undefined,
      runId: undefined,
      jobType: JOB_TYPES.exportLeaderboard,
      idempotencyKey: `export:leaderboard:${scopeKey}:${args.format}:${user._id}`,
      maxAttempts: 3,
      deadlineAt: now + 1000 * 60 * 10,
      createdByUserId: user._id,
      metadata: {
        exportId,
        format: args.format,
        scopeType: "leaderboard",
        categoryId: args.categoryId,
      },
    });

    const workId = await exportsWorkpool.enqueueAction(
      ctx,
      internal.exportActions.generateExportFile,
      { exportId },
      {
        retry: true,
        onComplete: internal.exports.handleExportCompletionInternal,
        context: {
          exportId,
          jobId,
        },
      },
    );

    await ctx.db.patch(exportId, { status: "running", updatedAt: now });
    await startJobAttempt(ctx, {
      jobId,
      workId,
      startedAt: now,
      metadata: {
        exportId,
      },
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      organizationId: user.defaultOrgId,
      projectId: undefined,
      action: "export.leaderboard.requested",
      resourceType: "export",
      resourceId: String(exportId),
      metadata: {
        format: args.format,
        categoryId: args.categoryId,
      },
      createdAt: now,
    });

    const exportDoc = await ctx.db.get(exportId);
    return toExportView(null, exportDoc!, null);
  },
});

export const handleExportCompletionInternal = exportsWorkpool.defineOnComplete({
  context: v.any(),
  handler: async (ctx, args) => {
    const context = args.context as {
      exportId: Id<"exports">;
      jobId: Id<"jobs">;
    };
    const exportDoc = (await ctx.db.get(context.exportId)) as Doc<"exports"> | null;
    if (!exportDoc) {
      return;
    }

    const now = Date.now();
    if (args.result.kind === "success") {
      const result = args.result.returnValue as {
        artifactId?: Id<"runArtifacts">;
        storageId?: Id<"_storage">;
        label: string;
        contentType: string;
        sizeBytes: number;
      };
      await ctx.db.patch(exportDoc._id, {
        status: "complete",
        artifactId: result.artifactId,
        storageId: result.storageId,
        label: result.label,
        contentType: result.contentType,
        sizeBytes: result.sizeBytes,
        updatedAt: now,
      });
      await finalizeJob(ctx, {
        jobId: context.jobId,
        status: JOB_STATUSES.complete,
        completedAt: now,
      });
      const run = exportDoc.runId
        ? ((await ctx.db.get(exportDoc.runId)) as Doc<"runs"> | null)
        : null;
      if (run) {
        await ctx.db.patch(run._id, {
          exportCount: run.exportCount + 1,
          updatedAt: Math.max(run.updatedAt, now),
        });
      }
      return;
    }

    const error =
      args.result.kind === "failed" ? args.result.error : "Export was canceled before completion";
    await ctx.db.patch(exportDoc._id, {
      status: args.result.kind,
      updatedAt: now,
    });
    await finalizeJob(ctx, {
      jobId: context.jobId,
      status:
        args.result.kind === "canceled" ? JOB_STATUSES.canceled : JOB_STATUSES.failed,
      completedAt: now,
      error,
      deadLetterReason:
        args.result.kind === "failed" ? "Export exhausted retries or failed generation." : undefined,
    });
  },
});

export const getExportBundleInternal = internalQuery({
  args: {
    exportId: v.id("exports"),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    const exportDoc = await ctx.db.get(args.exportId);
    if (!exportDoc) {
      throw new ConvexError("Export not found");
    }

    if ((exportDoc.scopeType ?? "run") === "run") {
      if (!exportDoc.runId) {
        throw new ConvexError("Run export is missing a run ID");
      }

      const run = await ctx.db.get(exportDoc.runId);
      if (!run) {
        throw new ConvexError("Run not found");
      }

      const [participants, events] = await Promise.all([
        ctx.db.query("runParticipants").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
        ctx.db
          .query("runEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", run._id))
          .collect(),
      ]);

      return {
        scopeType: "run",
        exportDoc,
        run,
        participants,
        events,
      };
    }

    if (exportDoc.scopeType === "project_summary") {
      if (!exportDoc.projectId) {
        throw new ConvexError("Project export is missing a project ID");
      }
      const summary: any = await ctx.runQuery(internal.analytics.getProjectSummaryInternal, {
        projectId: exportDoc.projectId,
      });
      return {
        scopeType: "project_summary",
        exportDoc,
        summary,
      };
    }

    if (exportDoc.scopeType === "leaderboard") {
      const globalSnapshot: any = await ctx.runQuery(internal.leaderboards.getSnapshotInternal, {
        categoryId: undefined,
      });
      const scopedSnapshot: any = await ctx.runQuery(internal.leaderboards.getSnapshotInternal, {
        categoryId: exportDoc.categoryId,
      });
      return {
        scopeType: "leaderboard",
        exportDoc,
        globalSnapshot,
        scopedSnapshot,
      };
    }

    throw new ConvexError("Unsupported export scope");
  },
});
