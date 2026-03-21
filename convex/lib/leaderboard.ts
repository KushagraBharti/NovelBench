import type { BenchmarkRun, LeaderboardData, LeaderboardEntry } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";

const FINAL_RANK_WEIGHT = 0.6;
const FINAL_SCORE_WEIGHT = 0.25;
const CRITIQUE_SCORE_WEIGHT = 0.15;

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rankToPercentile(rank: number, participantCount: number) {
  if (participantCount <= 1) {
    return 1;
  }
  return (participantCount - rank) / (participantCount - 1);
}

export function buildLeaderboardEntries(runs: BenchmarkRun[]): LeaderboardEntry[] {
  const stats = new Map<
    string,
    {
      wins: number;
      runCount: number;
      compositeTotal: number;
      finalScoreTotal: number;
      finalRankTotal: number;
      finishPercentileTotal: number;
      critiqueScoreTotal: number;
      critiqueCount: number;
    }
  >();

  for (const run of runs) {
    if (run.finalRankings.length === 0) {
      continue;
    }

    const candidateIds = Array.from(
      new Set([
        ...run.revisedIdeas.map((idea) => idea.modelId),
        ...run.finalRankings.flatMap((ranking) =>
          ranking.rankings.map((entry) => entry.modelId),
        ),
      ]),
    );
    if (candidateIds.length === 0) {
      continue;
    }

    const participantCount = candidateIds.length;
    const perModelFinals = new Map<string, { ranks: number[]; scores: number[] }>();

    for (const ranking of run.finalRankings) {
      for (const entry of ranking.rankings) {
        if (!candidateIds.includes(entry.modelId)) {
          continue;
        }
        const existing = perModelFinals.get(entry.modelId) ?? { ranks: [], scores: [] };
        existing.ranks.push(entry.rank);
        existing.scores.push(entry.score);
        perModelFinals.set(entry.modelId, existing);
      }
    }

    let winnerId = "";
    let bestAverageRank = Number.POSITIVE_INFINITY;
    let bestAverageScore = Number.NEGATIVE_INFINITY;

    for (const modelId of candidateIds) {
      const result = perModelFinals.get(modelId);
      if (!result || result.ranks.length === 0) {
        continue;
      }
      const averageRank = average(result.ranks);
      const averageScore = average(result.scores);

      if (
        averageRank < bestAverageRank ||
        (averageRank === bestAverageRank && averageScore > bestAverageScore)
      ) {
        winnerId = modelId;
        bestAverageRank = averageRank;
        bestAverageScore = averageScore;
      }
    }

    for (const modelId of candidateIds) {
      const finals = perModelFinals.get(modelId);
      if (!finals || finals.ranks.length === 0) {
        continue;
      }

      const averageFinalRank = average(finals.ranks);
      const averageFinalScore = average(finals.scores);
      const finishPercentile = rankToPercentile(averageFinalRank, participantCount);
      const critiqueScores = run.critiqueVotes.flatMap((vote) =>
        vote.critiques
          .filter((critique) => critique.targetModelId === modelId)
          .map((critique) => critique.score),
      );
      const critiqueAverage = average(critiqueScores);
      const compositeScore =
        (finishPercentile * FINAL_RANK_WEIGHT +
          (averageFinalScore / 10) * FINAL_SCORE_WEIGHT +
          (critiqueAverage / 10) * CRITIQUE_SCORE_WEIGHT) *
        100;

      const entry = stats.get(modelId) ?? {
        wins: 0,
        runCount: 0,
        compositeTotal: 0,
        finalScoreTotal: 0,
        finalRankTotal: 0,
        finishPercentileTotal: 0,
        critiqueScoreTotal: 0,
        critiqueCount: 0,
      };

      entry.runCount += 1;
      entry.compositeTotal += compositeScore;
      entry.finalScoreTotal += averageFinalScore;
      entry.finalRankTotal += averageFinalRank;
      entry.finishPercentileTotal += finishPercentile;
      entry.critiqueScoreTotal += critiqueScores.reduce((sum, score) => sum + score, 0);
      entry.critiqueCount += critiqueScores.length;
      if (modelId === winnerId) {
        entry.wins += 1;
      }
      stats.set(modelId, entry);
    }
  }

  return [...stats.entries()]
    .map(([modelId, stat]) => {
      const identity = getModelIdentity(modelId);
      return {
        modelId,
        modelName: identity.name,
        provider: identity.provider,
        wins: stat.wins,
        totalRuns: stat.runCount,
        compositeScore: stat.runCount > 0 ? stat.compositeTotal / stat.runCount : 0,
        averageFinalScore: stat.runCount > 0 ? stat.finalScoreTotal / stat.runCount : 0,
        averageFinalRank: stat.runCount > 0 ? stat.finalRankTotal / stat.runCount : 0,
        averageCritiqueScore:
          stat.critiqueCount > 0 ? stat.critiqueScoreTotal / stat.critiqueCount : 0,
        averageFinishPercentile:
          stat.runCount > 0 ? stat.finishPercentileTotal / stat.runCount : 0,
      };
    })
    .sort(
      (a, b) =>
        b.compositeScore - a.compositeScore ||
        a.averageFinalRank - b.averageFinalRank ||
        b.averageFinalScore - a.averageFinalScore ||
        b.wins - a.wins,
    );
}

export function buildLeaderboardData(runs: BenchmarkRun[]): LeaderboardData {
  const completedRuns = runs.filter((run) => run.status === "complete" || run.status === "partial");
  const byCategory: Record<string, LeaderboardEntry[]> = {};
  const categoryTotals: LeaderboardData["categoryTotals"] = {};

  for (const categoryId of new Set(completedRuns.map((run) => run.categoryId))) {
    const categoryRuns = completedRuns.filter((run) => run.categoryId === categoryId);
    byCategory[categoryId] = buildLeaderboardEntries(categoryRuns);
    categoryTotals[categoryId] = {
      runs: categoryRuns.length,
      ideas: categoryRuns.reduce((sum, run) => sum + run.ideas.length + run.revisedIdeas.length, 0),
      critiques: categoryRuns.reduce(
        (sum, run) =>
          sum +
          run.critiqueVotes.reduce((voteSum, vote) => voteSum + vote.critiques.length, 0) +
          run.humanCritiques.length,
        0,
      ),
      completedModels: categoryRuns.reduce(
        (sum, run) =>
          sum +
          Object.values(run.modelStates).filter((state) => state.status === "complete").length,
        0,
      ),
    };
  }

  return {
    global: buildLeaderboardEntries(completedRuns),
    byCategory,
    categoryTotals,
    totals: {
      runs: runs.length,
      ideas: runs.reduce((sum, run) => sum + run.ideas.length + run.revisedIdeas.length, 0),
      critiques: runs.reduce(
        (sum, run) =>
          sum +
          run.critiqueVotes.reduce((voteSum, vote) => voteSum + vote.critiques.length, 0) +
          run.humanCritiques.length,
        0,
      ),
      completedModels: runs.reduce(
        (sum, run) =>
          sum +
          Object.values(run.modelStates).filter((state) => state.status === "complete").length,
        0,
      ),
    },
  };
}
