import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { LeaderboardVotePhase } from "@/types";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { buildLeaderboardDataFromRecords } from "./lib/leaderboard";
import type { LeaderboardRunRecord } from "./lib/leaderboard";

const votePhaseValidator = v.union(v.literal("initial"), v.literal("final"));

function toSnapshotKey(categoryId?: string, votePhase: LeaderboardVotePhase = "final") {
  return categoryId ? `category:${categoryId}:${votePhase}` : `global:${votePhase}`;
}

export const get = query({
  args: {
    categoryId: v.optional(v.string()),
    votePhase: v.optional(votePhaseValidator),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const votePhase = args.votePhase ?? "final";
    const snapshotKey = toSnapshotKey(args.categoryId, votePhase);
    const snapshot = await ctx.db
      .query("leaderboardSnapshots")
      .withIndex("by_snapshot_key", (q) => q.eq("snapshotKey", snapshotKey))
      .unique();
    if (!snapshot) {
      return {
        votePhase,
        entries: [],
        metadata: {
          featuredMatchups: [],
          coverageGaps: [],
        },
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
      votePhase,
      entries: snapshot.entries,
      metadata: snapshot.metadata ?? {
        featuredMatchups: [],
        coverageGaps: [],
      },
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
    votePhase: v.optional(votePhaseValidator),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const snapshotKey = toSnapshotKey(args.categoryId, args.votePhase ?? "final");
    const snapshot = await ctx.db
      .query("leaderboardSnapshots")
      .withIndex("by_snapshot_key", (q) => q.eq("snapshotKey", snapshotKey))
      .unique();
    return snapshot ?? null;
  },
});

export const getRunRecordsPageInternal = internalQuery({
  args: {
    status: v.union(v.literal("complete"), v.literal("partial")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("runs")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", args.status))
      .order("desc")
      .paginate(args.paginationOpts);

    const records: LeaderboardRunRecord[] = [];
    for (const run of page.page) {
      if (run.visibility !== "public" && run.visibility !== "public_full") {
        continue;
      }

      const [participants, events] = await Promise.all([
        ctx.db.query("runParticipants").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
        ctx.db
          .query("runEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", run._id))
          .collect(),
      ]);

      records.push({
        runId: run._id,
        categoryId: run.categoryId,
        status: run.status,
        updatedAt: new Date(run.updatedAt).toISOString(),
        ideaModelIds: participants
          .filter((participant) => participant.generatedIdea)
          .map((participant) => participant.modelId),
        revisedIdeaModelIds: participants
          .filter((participant) => participant.revisedIdea)
          .map((participant) => participant.modelId),
        critiqueVotes: participants
          .filter((participant) => participant.critiqueResult)
          .sort((a, b) => a.order - b.order)
          .map((participant) => participant.critiqueResult as LeaderboardRunRecord["critiqueVotes"][number]),
        finalRankings: participants
          .filter((participant) => participant.finalRanking)
          .sort((a, b) => a.order - b.order)
          .map((participant) => participant.finalRanking as LeaderboardRunRecord["finalRankings"][number]),
        humanCritiqueCount: events
          .filter((event) => event.kind === "human_critique_submitted")
          .reduce(
            (sum, event) =>
              sum +
              (((event.payload as { critiques?: unknown[] } | undefined)?.critiques?.length) ?? 0),
            0,
          ),
        completedModelCount: participants.filter((participant) => participant.status === "complete").length,
      });
    }

    return {
      page: records,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const writeSnapshotsInternal = internalMutation({
  args: {
    keys: v.array(v.any()),
    modelStats: v.array(v.any()),
    updatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existingSnapshots = await ctx.db.query("leaderboardSnapshots").collect();
    const nextSnapshotKeys = new Set(args.keys.map((entry: any) => entry.snapshotKey));

    for (const snapshot of existingSnapshots) {
      if (!nextSnapshotKeys.has(snapshot.snapshotKey)) {
        await ctx.db.delete(snapshot._id);
      }
    }

    for (const entry of args.keys) {
      const existing = await ctx.db
        .query("leaderboardSnapshots")
        .withIndex("by_snapshot_key", (q) => q.eq("snapshotKey", entry.snapshotKey))
        .unique();
      const payload = {
        snapshotKey: entry.snapshotKey,
        scopeType: entry.scopeType,
        scopeValue: entry.scopeValue,
        entries: entry.entries,
        metadata: entry.metadata,
        totals: entry.totals,
        updatedAt: args.updatedAt,
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

    for (const entry of args.modelStats) {
      await ctx.db.insert("modelStatsDaily", {
        modelId: entry.modelId,
        dayKey: entry.dayKey,
        wins: entry.wins,
        runs: entry.runs,
        averageFinalScore: entry.averageFinalScore,
        averageFinalRank: entry.averageFinalRank,
        updatedAt: args.updatedAt,
      });
    }

    return null;
  },
});

export const rebuildSnapshotsInternal = internalAction({
  args: {
    runId: v.optional(v.id("runs")),
  },
  returns: v.null(),
  handler: async (ctx) => {
    const records: LeaderboardRunRecord[] = [];

    for (const status of ["complete", "partial"] as const) {
      let cursor: string | null = null;
      let isDone = false;

      while (!isDone) {
        const page: {
          page: LeaderboardRunRecord[];
          isDone: boolean;
          continueCursor: string | null;
        } = await ctx.runQuery(internal.leaderboards.getRunRecordsPageInternal, {
          status,
          paginationOpts: {
            numItems: 8,
            cursor,
          },
        });
        records.push(...(page.page as LeaderboardRunRecord[]));
        cursor = page.continueCursor;
        isDone = page.isDone;
      }
    }

    const updatedAt = Date.now();
    const keys = (["final", "initial"] as const).flatMap((votePhase) => {
      const leaderboard = buildLeaderboardDataFromRecords(records, votePhase);
      return [
        {
          snapshotKey: toSnapshotKey(undefined, votePhase),
          scopeType: "global" as const,
          scopeValue: undefined,
          entries: leaderboard.global,
          metadata: leaderboard.insights,
          totals: leaderboard.totals,
        },
        ...Object.entries(leaderboard.byCategory).map(([categoryId, entries]) => ({
          snapshotKey: toSnapshotKey(categoryId, votePhase),
          scopeType: "category" as const,
          scopeValue: categoryId,
          entries,
          metadata: leaderboard.byCategoryInsights[categoryId] ?? {
            featuredMatchups: [],
            coverageGaps: [],
          },
          totals: leaderboard.categoryTotals[categoryId] ?? {
            runs: 0,
            ideas: 0,
            critiques: 0,
            completedModels: 0,
          },
        })),
      ];
    });

    const modelStatsMap = new Map<
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

    for (const record of records) {
      const dayKey = new Date(record.updatedAt).toISOString().slice(0, 10);
      for (const ranking of record.finalRankings) {
        for (const entry of ranking.rankings) {
          const key = `${entry.modelId}:${dayKey}`;
          const current = modelStatsMap.get(key) ?? {
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
          modelStatsMap.set(key, current);
        }
      }
    }

    await ctx.runMutation(internal.leaderboards.writeSnapshotsInternal, {
      keys,
      updatedAt,
      modelStats: Array.from(modelStatsMap.values()).map((entry) => ({
        modelId: entry.modelId,
        dayKey: entry.dayKey,
        wins: entry.wins,
        runs: entry.runs,
        averageFinalScore: entry.scoreTotal / entry.runs,
        averageFinalRank: entry.rankTotal / entry.runs,
      })),
    });

    return null;
  },
});
