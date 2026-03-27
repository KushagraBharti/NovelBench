"use node";

import { Buffer } from "node:buffer";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { runDocsToBenchmarkRun } from "./lib/runHelpers";
import {
  buildLeaderboardCsv,
  buildLeaderboardExportDocument,
  buildProjectSummaryCsv,
  buildProjectSummaryExportDocument,
  buildRunExportDocument,
  buildRunSummaryCsv,
} from "@/lib/export-format";
import type { LeaderboardData } from "@/types";

type GenerateExportResult = {
  artifactId?: Id<"runArtifacts">;
  storageId?: Id<"_storage">;
  label: string;
  contentType: string;
  sizeBytes: number;
};

function toStoragePayload(content: string, contentType: string) {
  return {
    blob: new Blob([content], { type: contentType }),
    sizeBytes: Buffer.byteLength(content, "utf8"),
  };
}

const generateExportFileHandler = async (
  ctx: any,
  args: { exportId: Id<"exports"> },
): Promise<GenerateExportResult> => {
  const bundle = await ctx.runQuery(internal.exports.getExportBundleInternal, {
    exportId: args.exportId,
  });

  if (bundle.scopeType === "run") {
    const run = runDocsToBenchmarkRun({
      run: bundle.run,
      participants: bundle.participants,
      events: bundle.events,
    });

    const exportDoc = bundle.exportDoc as {
      _id: Id<"exports">;
      runId: Id<"runs">;
      format: "json" | "csv";
    };
    const content =
      exportDoc.format === "json"
        ? JSON.stringify(buildRunExportDocument(run), null, 2)
        : buildRunSummaryCsv(run);
    const contentType = exportDoc.format === "json" ? "application/json" : "text/csv";
    const { blob, sizeBytes } = toStoragePayload(content, contentType);
    const storageId = await ctx.storage.store(blob);
    const artifactId: Id<"runArtifacts"> = await ctx.runMutation(
      internal.runs.insertArtifactInternal,
      {
        runId: exportDoc.runId,
        participantModelId: undefined,
        stage: "complete",
        artifactType: `export.${exportDoc.format}`,
        label: `Run export (${exportDoc.format.toUpperCase()})`,
        storageId,
        contentType,
        sizeBytes,
        metadata: {
          exportId: exportDoc._id,
          format: exportDoc.format,
          scopeType: "run",
        },
        createdAt: Date.now(),
      },
    );

    return {
      artifactId,
      label: `Run export (${exportDoc.format.toUpperCase()})`,
      contentType,
      sizeBytes,
    };
  }

  if (bundle.scopeType === "project_summary") {
    const exportDoc = bundle.exportDoc as {
      format: "json" | "csv";
      projectId: Id<"projects">;
    };
    const content =
      exportDoc.format === "json"
        ? JSON.stringify(buildProjectSummaryExportDocument(bundle.summary), null, 2)
        : buildProjectSummaryCsv(bundle.summary);
    const contentType = exportDoc.format === "json" ? "application/json" : "text/csv";
    const { blob, sizeBytes } = toStoragePayload(content, contentType);
    const storageId = await ctx.storage.store(blob);

    return {
      storageId,
      label: `Project summary export (${exportDoc.format.toUpperCase()})`,
      contentType,
      sizeBytes,
    };
  }

  if (bundle.scopeType === "leaderboard") {
    const exportDoc = bundle.exportDoc as {
      format: "json" | "csv";
      categoryId?: string;
    };
    const votePhase = bundle.votePhase ?? "final";
    const data: LeaderboardData = {
      votePhase,
      global: bundle.globalSnapshot?.entries ?? [],
      byCategory:
        exportDoc.categoryId && bundle.scopedSnapshot
          ? { [exportDoc.categoryId]: bundle.scopedSnapshot.entries }
          : {},
      categoryTotals:
        exportDoc.categoryId && bundle.scopedSnapshot
          ? { [exportDoc.categoryId]: bundle.scopedSnapshot.totals }
          : {},
      totals:
        bundle.globalSnapshot?.totals ??
        bundle.scopedSnapshot?.totals ?? {
          runs: 0,
          ideas: 0,
          critiques: 0,
          completedModels: 0,
        },
    };
    const content =
      exportDoc.format === "json"
        ? JSON.stringify(
            buildLeaderboardExportDocument(exportDoc.categoryId ?? null, data),
            null,
            2,
          )
        : buildLeaderboardCsv(exportDoc.categoryId ?? null, data);
    const contentType = exportDoc.format === "json" ? "application/json" : "text/csv";
    const { blob, sizeBytes } = toStoragePayload(content, contentType);
    const storageId = await ctx.storage.store(blob);
    const phaseLabel = votePhase === "initial" ? "1st vote" : "Final vote";
    const scopeLabel = exportDoc.categoryId
      ? `${exportDoc.categoryId} leaderboard (${phaseLabel})`
      : `Global leaderboard (${phaseLabel})`;

    return {
      storageId,
      label: `${scopeLabel} export (${exportDoc.format.toUpperCase()})`,
      contentType,
      sizeBytes,
    };
  }

  throw new Error(`Unsupported export scope: ${bundle.scopeType as string}`);
};

export const generateExportFile: ReturnType<typeof internalAction> = internalAction({
  args: {
    exportId: v.id("exports"),
  },
  returns: v.object({
    artifactId: v.optional(v.id("runArtifacts")),
    storageId: v.optional(v.id("_storage")),
    label: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
  }),
  handler: generateExportFileHandler,
});
