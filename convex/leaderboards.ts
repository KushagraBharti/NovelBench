import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { buildLeaderboardData } from "./lib/leaderboard";
import { runDocsToBenchmarkRun } from "./lib/runHelpers";

async function collectRunsByStatus(
  ctx: Parameters<typeof query>[0] extends never ? never : any,
  status: "complete" | "partial",
) {
  const runs = [];
  const runQuery = ctx.db
    .query("runs")
    .withIndex("by_status_and_created_at", (q: any) => q.eq("status", status))
    .order("desc");

  for await (const run of runQuery) {
    if (run.visibility === "public" || run.visibility === "public_full") {
      runs.push(run);
    }
  }

  return runs;
}

export const get = query({
  args: {
    categoryId: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const snapshotKey = args.categoryId ? `category:${args.categoryId}` : "global";
    const snapshot = await ctx.db
      .query("leaderboardSnapshots")
      .withIndex("by_snapshot_key", (q) => q.eq("snapshotKey", snapshotKey))
      .unique();
    if (!snapshot) {
      return {
        entries: [],
        categoryTotals: {},
        totals: {
          runs: 0,
          ideas: 0,
          critiques: 0,
          completedModels: 0,
        },
        updatedAt: null,
      };
    }
    return {
      entries: snapshot.entries,
      categoryTotals: snapshot.scopeValue
        ? { [snapshot.scopeValue]: snapshot.totals }
        : {},
      totals: snapshot.totals,
      updatedAt: snapshot.updatedAt,
    };
  },
});

export const getSnapshotInternal = internalQuery({
  args: {
    categoryId: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const snapshotKey = args.categoryId ? `category:${args.categoryId}` : "global";
    const snapshot = await ctx.db
      .query("leaderboardSnapshots")
      .withIndex("by_snapshot_key", (q) => q.eq("snapshotKey", snapshotKey))
      .unique();
    return snapshot ?? null;
  },
});

export const rebuildSnapshotsInternal = internalMutation({
  args: {
    runId: v.optional(v.id("runs")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [completeRuns, partialRuns] = await Promise.all([
      collectRunsByStatus(ctx, "complete"),
      collectRunsByStatus(ctx, "partial"),
    ]);
    const runs = [...completeRuns, ...partialRuns];
    const hydrated = [];

    for (const run of runs) {
      const [participants, events] = await Promise.all([
        ctx.db.query("runParticipants").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
        ctx.db
          .query("runEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", run._id))
          .collect(),
      ]);
      hydrated.push(runDocsToBenchmarkRun({ run, participants, events }));
    }

    const leaderboard = buildLeaderboardData(hydrated);
    const now = Date.now();
    const keys = [
      {
        snapshotKey: "global",
        scopeType: "global" as const,
        scopeValue: undefined,
        entries: leaderboard.global,
        totals: leaderboard.totals,
      },
      ...Object.entries(leaderboard.byCategory).map(([categoryId, entries]) => ({
        snapshotKey: `category:${categoryId}`,
        scopeType: "category" as const,
        scopeValue: categoryId,
        entries,
        totals: leaderboard.categoryTotals[categoryId] ?? {
          runs: 0,
          ideas: 0,
          critiques: 0,
          completedModels: 0,
        },
      })),
    ];

    const existingSnapshots = await ctx.db.query("leaderboardSnapshots").collect();
    const nextSnapshotKeys = new Set(keys.map((entry) => entry.snapshotKey));

    for (const snapshot of existingSnapshots) {
      if (!nextSnapshotKeys.has(snapshot.snapshotKey)) {
        await ctx.db.delete(snapshot._id);
      }
    }

    for (const entry of keys) {
      const existing = await ctx.db
        .query("leaderboardSnapshots")
        .withIndex("by_snapshot_key", (q) => q.eq("snapshotKey", entry.snapshotKey))
        .unique();
      const payload = {
        snapshotKey: entry.snapshotKey,
        scopeType: entry.scopeType,
        scopeValue: entry.scopeValue,
        entries: entry.entries,
        totals: entry.totals,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("leaderboardSnapshots", payload);
      }
    }

    while (true) {
      const batch = await ctx.db.query("modelStatsDaily").take(128);
      if (batch.length === 0) {
        break;
      }
      await Promise.all(batch.map((entry) => ctx.db.delete(entry._id)));
    }

    const modelStats = new Map<
      string,
      {
        modelId: string;
        dayKey: string;
        wins: number;
        runs: number;
        scoreTotal: number;
        rankTotal: number;
      }
    >();

    for (const hydratedRun of hydrated) {
      const dayKey = new Date(hydratedRun.updatedAt).toISOString().slice(0, 10);
      for (const ranking of hydratedRun.finalRankings) {
        for (const entry of ranking.rankings) {
          const key = `${entry.modelId}:${dayKey}`;
          const current = modelStats.get(key) ?? {
            modelId: entry.modelId,
            dayKey,
            wins: 0,
            runs: 0,
            scoreTotal: 0,
            rankTotal: 0,
          };
          current.wins += entry.rank === 1 ? 1 : 0;
          current.runs += 1;
          current.scoreTotal += entry.score;
          current.rankTotal += entry.rank;
          modelStats.set(key, current);
        }
      }
    }

    for (const entry of modelStats.values()) {
      await ctx.db.insert("modelStatsDaily", {
        modelId: entry.modelId,
        dayKey: entry.dayKey,
        wins: entry.wins,
        runs: entry.runs,
        averageFinalScore: entry.scoreTotal / entry.runs,
        averageFinalRank: entry.rankTotal / entry.runs,
        updatedAt: now,
      });
    }

    return null;
  },
});
