import type {
  BenchmarkRun,
  CritiqueVoteResult,
  LeaderboardData,
  LeaderboardEntry,
  LeaderboardVotePhase,
  Ranking,
  RankingEntry,
} from "@/types";
import { getModelIdentity } from "@/utils/model-identity";

const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const MIN_RD = 70;
const MAX_RD = 350;
const Q = Math.log(10) / 400;
const PROVISIONAL_MATCH_THRESHOLD = 12;

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundRating(value: number) {
  return Math.round(value * 10) / 10;
}

function glickoG(ratingDeviation: number) {
  return 1 / Math.sqrt(1 + (3 * Q * Q * ratingDeviation * ratingDeviation) / (Math.PI * Math.PI));
}

function glickoExpected(
  rating: number,
  opponentRating: number,
  opponentDeviation: number,
) {
  const g = glickoG(opponentDeviation);
  return 1 / (1 + Math.pow(10, (-g * (rating - opponentRating)) / 400));
}

export interface LeaderboardRunRecord {
  categoryId: string;
  status: BenchmarkRun["status"];
  updatedAt: string;
  ideaModelIds: string[];
  revisedIdeaModelIds: string[];
  critiqueVotes: CritiqueVoteResult[];
  finalRankings: Ranking[];
  humanCritiqueCount: number;
  completedModelCount: number;
}

type ModelRatingState = {
  rating: number;
  ratingDeviation: number;
};

type ModelAggregate = {
  wins: number;
  totalRuns: number;
  pairwiseWins: number;
  pairwiseMatches: number;
  finalScoreTotal: number;
  finalRankTotal: number;
  finalCount: number;
};

type ComparisonAggregate = {
  actualScore: number;
  weight: number;
};

function getPhaseRankings(
  run: Pick<LeaderboardRunRecord, "critiqueVotes" | "finalRankings">,
  votePhase: LeaderboardVotePhase,
): Ranking[] {
  if (votePhase === "initial") {
    return run.critiqueVotes
      .filter((vote) => vote.rankings.length > 0)
      .map((vote) => ({
        judgeModelId: vote.fromModelId,
        rankings: vote.rankings,
      }));
  }

  return run.finalRankings.filter((ranking) => ranking.rankings.length > 0);
}

function getPhaseCandidateIds(
  run: Pick<
    LeaderboardRunRecord,
    "ideaModelIds" | "revisedIdeaModelIds" | "critiqueVotes" | "finalRankings"
  >,
  votePhase: LeaderboardVotePhase,
): string[] {
  const phaseIdeaModelIds = votePhase === "initial" ? run.ideaModelIds : run.revisedIdeaModelIds;
  return Array.from(
    new Set([
      ...phaseIdeaModelIds,
      ...getPhaseRankings(run, votePhase).flatMap((ranking) =>
        ranking.rankings.map((entry) => entry.modelId),
      ),
    ]),
  );
}

function isRankedRun(
  run: Pick<
    LeaderboardRunRecord,
    "ideaModelIds" | "revisedIdeaModelIds" | "critiqueVotes" | "finalRankings"
  >,
  votePhase: LeaderboardVotePhase,
) {
  return (
    getPhaseRankings(run, votePhase).length > 0 &&
    getPhaseCandidateIds(run, votePhase).length > 1
  );
}

function getWinnerId(rankings: Ranking[], candidateIds: string[]) {
  const perModel = new Map<string, { ranks: number[]; scores: number[] }>();

  for (const ranking of rankings) {
    for (const entry of ranking.rankings) {
      if (!candidateIds.includes(entry.modelId)) {
        continue;
      }
      const current = perModel.get(entry.modelId) ?? { ranks: [], scores: [] };
      current.ranks.push(entry.rank);
      current.scores.push(entry.score);
      perModel.set(entry.modelId, current);
    }
  }

  let winnerId = "";
  let bestAverageRank = Number.POSITIVE_INFINITY;
  let bestAverageScore = Number.NEGATIVE_INFINITY;

  for (const modelId of candidateIds) {
    const current = perModel.get(modelId);
    if (!current || current.ranks.length === 0) {
      continue;
    }

    const averageRank = average(current.ranks);
    const averageScore = average(current.scores);
    if (
      averageRank < bestAverageRank ||
      (averageRank === bestAverageRank && averageScore > bestAverageScore)
    ) {
      winnerId = modelId;
      bestAverageRank = averageRank;
      bestAverageScore = averageScore;
    }
  }

  return winnerId || null;
}

function getOrCreateAggregate(map: Map<string, ModelAggregate>, modelId: string): ModelAggregate {
  const current = map.get(modelId);
  if (current) {
    return current;
  }

  const next: ModelAggregate = {
    wins: 0,
    totalRuns: 0,
    pairwiseWins: 0,
    pairwiseMatches: 0,
    finalScoreTotal: 0,
    finalRankTotal: 0,
    finalCount: 0,
  };
  map.set(modelId, next);
  return next;
}

function getOrCreateRatingState(
  map: Map<string, ModelRatingState>,
  modelId: string,
): ModelRatingState {
  const current = map.get(modelId);
  if (current) {
    return current;
  }

  const next: ModelRatingState = {
    rating: DEFAULT_RATING,
    ratingDeviation: DEFAULT_RD,
  };
  map.set(modelId, next);
  return next;
}

function getOrCreateComparisonAggregate(
  map: Map<string, ComparisonAggregate>,
  opponentId: string,
): ComparisonAggregate {
  const current = map.get(opponentId);
  if (current) {
    return current;
  }

  const next: ComparisonAggregate = {
    actualScore: 0,
    weight: 0,
  };
  map.set(opponentId, next);
  return next;
}

function buildRunComparisons(
  phaseRankings: Ranking[],
  candidateIds: string[],
) {
  const perModelComparisons = new Map<string, Map<string, ComparisonAggregate>>();
  const perModelFinals = new Map<string, { ranks: number[]; scores: number[] }>();

  for (const ranking of phaseRankings) {
    const entries = ranking.rankings.filter((entry) => candidateIds.includes(entry.modelId));
    for (const entry of entries) {
      const finals = perModelFinals.get(entry.modelId) ?? { ranks: [], scores: [] };
      finals.ranks.push(entry.rank);
      finals.scores.push(entry.score);
      perModelFinals.set(entry.modelId, finals);
    }

    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const left = entries[i];
        const right = entries[j];
        let leftScore = 0.5;
        let rightScore = 0.5;

        if (left.rank < right.rank) {
          leftScore = 1;
          rightScore = 0;
        } else if (left.rank > right.rank) {
          leftScore = 0;
          rightScore = 1;
        }

        const leftMap =
          perModelComparisons.get(left.modelId) ?? new Map<string, ComparisonAggregate>();
        const rightMap =
          perModelComparisons.get(right.modelId) ?? new Map<string, ComparisonAggregate>();
        perModelComparisons.set(left.modelId, leftMap);
        perModelComparisons.set(right.modelId, rightMap);

        const leftAggregate = getOrCreateComparisonAggregate(leftMap, right.modelId);
        leftAggregate.actualScore += leftScore;
        leftAggregate.weight += 1;

        const rightAggregate = getOrCreateComparisonAggregate(rightMap, left.modelId);
        rightAggregate.actualScore += rightScore;
        rightAggregate.weight += 1;
      }
    }
  }

  return {
    perModelComparisons,
    perModelFinals,
  };
}

function buildLeaderboardEntries(
  runs: LeaderboardRunRecord[],
  votePhase: LeaderboardVotePhase,
): LeaderboardEntry[] {
  const aggregates = new Map<string, ModelAggregate>();
  const ratingStates = new Map<string, ModelRatingState>();

  for (const run of runs) {
    const phaseRankings = getPhaseRankings(run, votePhase);
    if (phaseRankings.length === 0) {
      continue;
    }

    const candidateIds = getPhaseCandidateIds(run, votePhase);
    if (candidateIds.length <= 1) {
      continue;
    }

    const { perModelComparisons, perModelFinals } = buildRunComparisons(phaseRankings, candidateIds);
    const winnerId = getWinnerId(phaseRankings, candidateIds);

    for (const modelId of candidateIds) {
      const finals = perModelFinals.get(modelId);
      if (!finals || finals.ranks.length === 0) {
        continue;
      }

      const aggregate = getOrCreateAggregate(aggregates, modelId);
      aggregate.totalRuns += 1;
      aggregate.finalRankTotal += average(finals.ranks);
      aggregate.finalScoreTotal += average(finals.scores);
      aggregate.finalCount += 1;
      if (winnerId === modelId) {
        aggregate.wins += 1;
      }
    }

    const nextRunUpdates = new Map<string, ModelRatingState>();

    for (const [modelId, opponentMap] of perModelComparisons.entries()) {
      const currentState = getOrCreateRatingState(ratingStates, modelId);
      const aggregate = getOrCreateAggregate(aggregates, modelId);
      const currentDeviation = Math.min(MAX_RD, Math.max(MIN_RD, currentState.ratingDeviation));

      let varianceTerm = 0;
      let deltaTerm = 0;

      for (const [opponentId, comparison] of opponentMap.entries()) {
        const opponentState = getOrCreateRatingState(ratingStates, opponentId);
        const opponentDeviation = Math.min(
          MAX_RD,
          Math.max(MIN_RD, opponentState.ratingDeviation),
        );
        const g = glickoG(opponentDeviation);
        const expectedScore = glickoExpected(
          currentState.rating,
          opponentState.rating,
          opponentDeviation,
        );
        const averageActualScore = comparison.actualScore / comparison.weight;

        varianceTerm += comparison.weight * g * g * expectedScore * (1 - expectedScore);
        deltaTerm += comparison.weight * g * (averageActualScore - expectedScore);
        aggregate.pairwiseMatches += comparison.weight;
        aggregate.pairwiseWins += comparison.actualScore;
      }

      if (varianceTerm <= 0) {
        nextRunUpdates.set(modelId, currentState);
        continue;
      }

      const dSquared = 1 / (Q * Q * varianceTerm);
      const denominator = 1 / (currentDeviation * currentDeviation) + 1 / dSquared;
      const updatedDeviation = Math.max(MIN_RD, Math.sqrt(1 / denominator));
      const updatedRating =
        currentState.rating + (Q / denominator) * deltaTerm;

      nextRunUpdates.set(modelId, {
        rating: updatedRating,
        ratingDeviation: updatedDeviation,
      });
    }

    for (const [modelId, nextState] of nextRunUpdates.entries()) {
      ratingStates.set(modelId, nextState);
    }
  }

  return [...aggregates.entries()]
    .map(([modelId, aggregate]) => {
      const identity = getModelIdentity(modelId);
      const ratingState = getOrCreateRatingState(ratingStates, modelId);
      const pairwiseWinRate =
        aggregate.pairwiseMatches > 0 ? aggregate.pairwiseWins / aggregate.pairwiseMatches : 0;

      return {
        modelId,
        modelName: identity.name,
        provider: identity.provider,
        wins: aggregate.wins,
        totalRuns: aggregate.totalRuns,
        rating: roundRating(ratingState.rating),
        ratingDeviation: roundRating(ratingState.ratingDeviation),
        conservativeRating: roundRating(
          ratingState.rating - ratingState.ratingDeviation * 2,
        ),
        pairwiseWins: roundRating(aggregate.pairwiseWins),
        pairwiseMatches: roundRating(aggregate.pairwiseMatches),
        pairwiseWinRate: roundRating(pairwiseWinRate * 100),
        provisional: aggregate.pairwiseMatches < PROVISIONAL_MATCH_THRESHOLD,
        averageFinalScore:
          aggregate.finalCount > 0 ? aggregate.finalScoreTotal / aggregate.finalCount : 0,
        averageFinalRank:
          aggregate.finalCount > 0 ? aggregate.finalRankTotal / aggregate.finalCount : 0,
      };
    })
    .sort(
      (a, b) =>
        b.conservativeRating - a.conservativeRating ||
        b.rating - a.rating ||
        a.averageFinalRank - b.averageFinalRank ||
        b.pairwiseWinRate - a.pairwiseWinRate ||
        b.wins - a.wins,
    );
}

export function buildLeaderboardDataFromRecords(
  runs: LeaderboardRunRecord[],
  votePhase: LeaderboardVotePhase = "final",
): LeaderboardData {
  const completedRuns = runs.filter((run) => run.status === "complete" || run.status === "partial");
  const rankedRuns = completedRuns.filter((run) => isRankedRun(run, votePhase));
  const byCategory: Record<string, LeaderboardEntry[]> = {};
  const categoryTotals: LeaderboardData["categoryTotals"] = {};

  for (const categoryId of new Set(rankedRuns.map((run) => run.categoryId))) {
    const categoryRuns = rankedRuns.filter((run) => run.categoryId === categoryId);
    byCategory[categoryId] = buildLeaderboardEntries(categoryRuns, votePhase);
    categoryTotals[categoryId] = {
      runs: categoryRuns.length,
      ideas: categoryRuns.reduce(
        (sum, run) =>
          sum +
          (votePhase === "initial"
            ? run.ideaModelIds.length
            : run.ideaModelIds.length + run.revisedIdeaModelIds.length),
        0,
      ),
      critiques: categoryRuns.reduce(
        (sum, run) =>
          sum +
          run.critiqueVotes.reduce((voteSum, vote) => voteSum + vote.critiques.length, 0) +
          run.humanCritiqueCount,
        0,
      ),
      completedModels: categoryRuns.reduce((sum, run) => sum + run.completedModelCount, 0),
    };
  }

  return {
    votePhase,
    global: buildLeaderboardEntries(rankedRuns, votePhase),
    byCategory,
    categoryTotals,
    totals: {
      runs: rankedRuns.length,
      ideas: rankedRuns.reduce(
        (sum, run) =>
          sum +
          (votePhase === "initial"
            ? run.ideaModelIds.length
            : run.ideaModelIds.length + run.revisedIdeaModelIds.length),
        0,
      ),
      critiques: rankedRuns.reduce(
        (sum, run) =>
          sum +
          run.critiqueVotes.reduce((voteSum, vote) => voteSum + vote.critiques.length, 0) +
          run.humanCritiqueCount,
        0,
      ),
      completedModels: rankedRuns.reduce((sum, run) => sum + run.completedModelCount, 0),
    },
  };
}

export function buildLeaderboardData(
  runs: BenchmarkRun[],
  votePhase: LeaderboardVotePhase = "final",
): LeaderboardData {
  return buildLeaderboardDataFromRecords(
    runs.map((run) => ({
      categoryId: run.categoryId,
      status: run.status,
      updatedAt: run.updatedAt,
      ideaModelIds: run.ideas.map((idea) => idea.modelId),
      revisedIdeaModelIds: run.revisedIdeas.map((idea) => idea.modelId),
      critiqueVotes: run.critiqueVotes,
      finalRankings: run.finalRankings,
      humanCritiqueCount: run.humanCritiques.length,
      completedModelCount: Object.values(run.modelStates).filter(
        (state) => state.status === "complete",
      ).length,
    })),
    votePhase,
  );
}
