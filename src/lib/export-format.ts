import type { BenchmarkRun, LeaderboardData } from "@/types";

function csvEscape(value: string | number | boolean | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function buildRunExportDocument(run: BenchmarkRun) {
  return {
    exportedAt: new Date().toISOString(),
    run,
  };
}

export function buildRunSummaryCsv(run: BenchmarkRun) {
  const headers = [
    "modelId",
    "modelName",
    "status",
    "stage",
    "ideaTitle",
    "revisedTitle",
    "averageFinalRank",
    "averageFinalScore",
    "failure",
  ];

  const rankingStats = new Map<string, { scoreTotal: number; rankTotal: number; count: number }>();
  for (const ranking of run.finalRankings) {
    for (const entry of ranking.rankings) {
      const current = rankingStats.get(entry.modelId) ?? {
        scoreTotal: 0,
        rankTotal: 0,
        count: 0,
      };
      current.scoreTotal += entry.score;
      current.rankTotal += entry.rank;
      current.count += 1;
      rankingStats.set(entry.modelId, current);
    }
  }

  const rows = run.selectedModels.map((model) => {
    const state = run.modelStates[model.id];
    const idea = run.ideas.find((entry) => entry.modelId === model.id);
    const revised = run.revisedIdeas.find((entry) => entry.modelId === model.id);
    const failure = run.failures.find((entry) => entry.modelId === model.id);
    const stats = rankingStats.get(model.id);
    const averageRank = stats && stats.count > 0 ? (stats.rankTotal / stats.count).toFixed(2) : "";
    const averageScore =
      stats && stats.count > 0 ? (stats.scoreTotal / stats.count).toFixed(2) : "";

    return [
      model.id,
      model.name,
      state?.status ?? "",
      state?.stage ?? "",
      idea?.content.title ?? "",
      revised?.content.title ?? "",
      averageRank,
      averageScore,
      state?.error ?? failure?.message ?? "",
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\n");
}

export function buildProjectSummaryExportDocument(summary: any) {
  return {
    exportedAt: new Date().toISOString(),
    scope: "project_summary",
    summary,
  };
}

export function buildProjectSummaryCsv(summary: any) {
  const rows = [
    ["metric", "value"],
    ["project", summary.project.name],
    ["visibility", summary.project.visibility],
    ["runCount", summary.totals.runCount],
    ["completedRuns", summary.totals.completedRuns],
    ["partialRuns", summary.totals.partialRuns],
    ["failedRuns", summary.totals.failedRuns],
    ["settledCostUsd", summary.totals.settledCostUsd],
  ];

  return rows.map((row) => row.map((value) => csvEscape(value)).join(",")).join("\n");
}

export function buildLeaderboardExportDocument(categoryId: string | null, data: LeaderboardData) {
  return {
    exportedAt: new Date().toISOString(),
    scope: "leaderboard",
    categoryId,
    data,
  };
}

export function buildLeaderboardCsv(categoryId: string | null, data: LeaderboardData) {
  const entries = categoryId ? data.byCategory[categoryId] ?? [] : data.global;
  const headers = [
    "modelId",
    "modelName",
    "provider",
    "wins",
    "totalRuns",
    "rating",
    "ratingDeviation",
    "effectiveRatingDeviation",
    "conservativeRating",
    "confidenceScore",
    "pairwiseWins",
    "pairwiseMatches",
    "pairwiseWinRate",
    "directOpponentCount",
    "nearbyOpponentCount",
    "nearbyCoveredOpponentCount",
    "provisional",
    "averageFinalScore",
    "averageFinalRank",
  ];

  const rows = entries.map((entry) => [
    entry.modelId,
    entry.modelName,
    entry.provider,
    entry.wins,
    entry.totalRuns,
    entry.rating,
    entry.ratingDeviation,
    entry.effectiveRatingDeviation,
    entry.conservativeRating,
    entry.confidenceScore,
    entry.pairwiseWins,
    entry.pairwiseMatches,
    entry.pairwiseWinRate,
    entry.directOpponentCount,
    entry.nearbyOpponentCount,
    entry.nearbyCoveredOpponentCount,
    entry.provisional,
    entry.averageFinalScore,
    entry.averageFinalRank,
  ]);

  return [["scope", categoryId ?? "global"], ["votePhase", data.votePhase], headers, ...rows]
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\n");
}
