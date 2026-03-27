import type {
  BenchmarkRun,
  CritiqueVoteResult,
  LeaderboardCoverageGap,
  LeaderboardData,
  LeaderboardEntry,
  LeaderboardHeadToHead,
  LeaderboardInsights,
  LeaderboardVotePhase,
  Ranking,
} from "@/types";
import { categories } from "@/lib/categories";
import { getModelIdentity } from "@/utils/model-identity";

const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const MIN_RD = 70;
const MAX_RD = 350;
const Q = Math.log(10) / 400;
const PROVISIONAL_MATCH_THRESHOLD = 8;
const FEATURED_MATCHUP_LIMIT = 6;
const COVERAGE_GAP_LIMIT = 4;
const NEARBY_WINDOW = 2;
const SPECIAL_MATCHUPS = [["claude-opus-4.6", "claude-haiku-4.5"]] as const;

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundRating(value: number) {
  return Math.round(value * 10) / 10;
}

function roundPercent(value: number) {
  return Math.round(value);
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

function normalizeCategorySuggestions(categoryId?: string) {
  if (categoryId) {
    return [categoryId];
  }

  return ["frontier", "venture", "story"];
}

function coverageLevelForRuns(directRuns: number): LeaderboardHeadToHead["coverageLevel"] {
  if (directRuns <= 0) {
    return "none";
  }
  if (directRuns === 1) {
    return "thin";
  }
  return "good";
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

type DirectMatchupAggregate = {
  directRuns: number;
  pairwiseMatches: number;
  leftScore: number;
  rightScore: number;
};

type PairBallotAggregate = {
  leftModelId: string;
  rightModelId: string;
  leftScoreTotal: number;
  rightScoreTotal: number;
  ballotCount: number;
};

type LeaderboardComputation = {
  entries: LeaderboardEntry[];
  insights: LeaderboardInsights;
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

function pairKey(leftModelId: string, rightModelId: string) {
  return [leftModelId, rightModelId].sort().join("::");
}

function getOrCreatePairBallotAggregate(
  map: Map<string, PairBallotAggregate>,
  leftModelId: string,
  rightModelId: string,
): PairBallotAggregate {
  const key = pairKey(leftModelId, rightModelId);
  const current = map.get(key);
  if (current) {
    return current;
  }

  const sorted = [leftModelId, rightModelId].sort();
  const next: PairBallotAggregate = {
    leftModelId: sorted[0]!,
    rightModelId: sorted[1]!,
    leftScoreTotal: 0,
    rightScoreTotal: 0,
    ballotCount: 0,
  };
  map.set(key, next);
  return next;
}

function getOrCreateDirectMatchupAggregate(
  map: Map<string, DirectMatchupAggregate>,
  leftModelId: string,
  rightModelId: string,
): DirectMatchupAggregate {
  const key = pairKey(leftModelId, rightModelId);
  const current = map.get(key);
  if (current) {
    return current;
  }

  const next: DirectMatchupAggregate = {
    directRuns: 0,
    pairwiseMatches: 0,
    leftScore: 0,
    rightScore: 0,
  };
  map.set(key, next);
  return next;
}

function buildRunComparisons(
  phaseRankings: Ranking[],
  candidateIds: string[],
) {
  const perModelComparisons = new Map<string, Map<string, ComparisonAggregate>>();
  const perModelFinals = new Map<string, { ranks: number[]; scores: number[] }>();
  const pairBallots = new Map<string, PairBallotAggregate>();

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
        const left = entries[i]!;
        const right = entries[j]!;
        const pairAggregate = getOrCreatePairBallotAggregate(
          pairBallots,
          left.modelId,
          right.modelId,
        );

        let leftScore = 0.5;
        let rightScore = 0.5;

        if (left.rank < right.rank) {
          leftScore = 1;
          rightScore = 0;
        } else if (left.rank > right.rank) {
          leftScore = 0;
          rightScore = 1;
        }

        if (pairAggregate.leftModelId === left.modelId) {
          pairAggregate.leftScoreTotal += leftScore;
          pairAggregate.rightScoreTotal += rightScore;
        } else {
          pairAggregate.leftScoreTotal += rightScore;
          pairAggregate.rightScoreTotal += leftScore;
        }
        pairAggregate.ballotCount += 1;
      }
    }
  }

  for (const pairAggregate of pairBallots.values()) {
    if (pairAggregate.ballotCount <= 0) {
      continue;
    }

    const leftAverageScore = pairAggregate.leftScoreTotal / pairAggregate.ballotCount;
    const rightAverageScore = pairAggregate.rightScoreTotal / pairAggregate.ballotCount;

    const leftMap =
      perModelComparisons.get(pairAggregate.leftModelId) ??
      new Map<string, ComparisonAggregate>();
    const rightMap =
      perModelComparisons.get(pairAggregate.rightModelId) ??
      new Map<string, ComparisonAggregate>();
    perModelComparisons.set(pairAggregate.leftModelId, leftMap);
    perModelComparisons.set(pairAggregate.rightModelId, rightMap);

    const leftAggregate = getOrCreateComparisonAggregate(leftMap, pairAggregate.rightModelId);
    leftAggregate.actualScore += leftAverageScore;
    leftAggregate.weight += 1;

    const rightAggregate = getOrCreateComparisonAggregate(rightMap, pairAggregate.leftModelId);
    rightAggregate.actualScore += rightAverageScore;
    rightAggregate.weight += 1;
  }

  return {
    perModelComparisons,
    perModelFinals,
    pairComparisons: Array.from(pairBallots.values()).map((pairAggregate) => ({
      leftModelId: pairAggregate.leftModelId,
      rightModelId: pairAggregate.rightModelId,
      leftAverageScore:
        pairAggregate.ballotCount > 0
          ? pairAggregate.leftScoreTotal / pairAggregate.ballotCount
          : 0.5,
      rightAverageScore:
        pairAggregate.ballotCount > 0
          ? pairAggregate.rightScoreTotal / pairAggregate.ballotCount
          : 0.5,
    })),
  };
}

function buildHeadToHead(
  modelAId: string,
  modelBId: string,
  directMatchups: Map<string, DirectMatchupAggregate>,
): LeaderboardHeadToHead {
  const sorted = [modelAId, modelBId].sort();
  const matchup = directMatchups.get(pairKey(modelAId, modelBId));
  const identityA = getModelIdentity(modelAId);
  const identityB = getModelIdentity(modelBId);
  const modelAScore =
    matchup == null
      ? 0
      : sorted[0] === modelAId
        ? matchup.leftScore
        : matchup.rightScore;
  const modelBScore =
    matchup == null
      ? 0
      : sorted[0] === modelAId
        ? matchup.rightScore
        : matchup.leftScore;

  return {
    modelAId,
    modelAName: identityA.name,
    modelBId,
    modelBName: identityB.name,
    directRuns: matchup?.directRuns ?? 0,
    pairwiseMatches: matchup?.pairwiseMatches ?? 0,
    modelAScore: roundRating(modelAScore),
    modelBScore: roundRating(modelBScore),
    coverageLevel: coverageLevelForRuns(matchup?.directRuns ?? 0),
  };
}

function buildCoverageReason(headToHead: LeaderboardHeadToHead) {
  if (headToHead.directRuns === 0) {
    return "No direct run yet. Current ordering is inferred through shared opponents.";
  }
  if (headToHead.directRuns === 1) {
    return "Only one direct run so far. The ordering is still fragile.";
  }
  return "Direct coverage exists, but more overlap would harden the ordering.";
}

function buildInsights(
  entries: LeaderboardEntry[],
  directMatchups: Map<string, DirectMatchupAggregate>,
  categoryId?: string,
): LeaderboardInsights {
  const featuredPairs: LeaderboardHeadToHead[] = [];
  const seenPairKeys = new Set<string>();
  const entryIndex = new Map(entries.map((entry, index) => [entry.modelId, index]));

  const pushPair = (modelAId: string, modelBId: string) => {
    if (!modelAId || !modelBId || modelAId === modelBId) {
      return;
    }
    const key = pairKey(modelAId, modelBId);
    if (seenPairKeys.has(key)) {
      return;
    }
    seenPairKeys.add(key);
    featuredPairs.push(buildHeadToHead(modelAId, modelBId, directMatchups));
  };

  for (let index = 0; index < entries.length - 1 && featuredPairs.length < FEATURED_MATCHUP_LIMIT; index += 1) {
    pushPair(entries[index]!.modelId, entries[index + 1]!.modelId);
  }

  for (const [leftModelId, rightModelId] of SPECIAL_MATCHUPS) {
    if (entries.some((entry) => entry.modelId === leftModelId) && entries.some((entry) => entry.modelId === rightModelId)) {
      pushPair(leftModelId, rightModelId);
    }
  }

  const coverageGaps: LeaderboardCoverageGap[] = featuredPairs
    .filter((matchup) => matchup.directRuns < 2)
    .sort((left, right) => left.directRuns - right.directRuns || left.pairwiseMatches - right.pairwiseMatches)
    .slice(0, COVERAGE_GAP_LIMIT)
    .map((matchup) => {
      const modelAIndex = entryIndex.get(matchup.modelAId) ?? Number.POSITIVE_INFINITY;
      const modelBIndex = entryIndex.get(matchup.modelBId) ?? Number.POSITIVE_INFINITY;
      const higherModel =
        modelAIndex <= modelBIndex
          ? { id: matchup.modelAId, name: matchup.modelAName }
          : { id: matchup.modelBId, name: matchup.modelBName };
      const lowerModel =
        modelAIndex <= modelBIndex
          ? { id: matchup.modelBId, name: matchup.modelBName }
          : { id: matchup.modelAId, name: matchup.modelAName };

      return {
        higherModelId: higherModel.id,
        higherModelName: higherModel.name,
        lowerModelId: lowerModel.id,
        lowerModelName: lowerModel.name,
        directRuns: matchup.directRuns,
        pairwiseMatches: matchup.pairwiseMatches,
        reason: buildCoverageReason(matchup),
        suggestedCategoryIds: normalizeCategorySuggestions(categoryId),
      };
    });

  return {
    featuredMatchups: featuredPairs,
    coverageGaps,
  };
}

function buildLeaderboardComputation(
  runs: LeaderboardRunRecord[],
  votePhase: LeaderboardVotePhase,
  categoryId?: string,
): LeaderboardComputation {
  const aggregates = new Map<string, ModelAggregate>();
  const ratingStates = new Map<string, ModelRatingState>();
  const directMatchups = new Map<string, DirectMatchupAggregate>();
  const directOpponents = new Map<string, Set<string>>();

  for (const run of runs) {
    const phaseRankings = getPhaseRankings(run, votePhase);
    if (phaseRankings.length === 0) {
      continue;
    }

    const candidateIds = getPhaseCandidateIds(run, votePhase);
    if (candidateIds.length <= 1) {
      continue;
    }

    const { perModelComparisons, perModelFinals, pairComparisons } = buildRunComparisons(
      phaseRankings,
      candidateIds,
    );
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

    for (const comparison of pairComparisons) {
      const matchup = getOrCreateDirectMatchupAggregate(
        directMatchups,
        comparison.leftModelId,
        comparison.rightModelId,
      );
      matchup.directRuns += 1;
      matchup.pairwiseMatches += 1;
      matchup.leftScore += comparison.leftAverageScore;
      matchup.rightScore += comparison.rightAverageScore;

      const leftOpponents = directOpponents.get(comparison.leftModelId) ?? new Set<string>();
      leftOpponents.add(comparison.rightModelId);
      directOpponents.set(comparison.leftModelId, leftOpponents);

      const rightOpponents = directOpponents.get(comparison.rightModelId) ?? new Set<string>();
      rightOpponents.add(comparison.leftModelId);
      directOpponents.set(comparison.rightModelId, rightOpponents);
    }

    const nextRunUpdates = new Map<string, ModelRatingState>();

    for (const [modelId, opponentMap] of perModelComparisons.entries()) {
      const currentState = getOrCreateRatingState(ratingStates, modelId);
      const aggregate = getOrCreateAggregate(aggregates, modelId);
      const currentDeviation = clamp(currentState.ratingDeviation, MIN_RD, MAX_RD);

      let varianceTerm = 0;
      let deltaTerm = 0;

      for (const [opponentId, comparison] of opponentMap.entries()) {
        const opponentState = getOrCreateRatingState(ratingStates, opponentId);
        const opponentDeviation = clamp(opponentState.ratingDeviation, MIN_RD, MAX_RD);
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
      const updatedRating = currentState.rating + (Q / denominator) * deltaTerm;

      nextRunUpdates.set(modelId, {
        rating: updatedRating,
        ratingDeviation: updatedDeviation,
      });
    }

    for (const [modelId, nextState] of nextRunUpdates.entries()) {
      ratingStates.set(modelId, nextState);
    }
  }

  const rawEntries = [...aggregates.entries()].map(([modelId, aggregate]) => {
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
      effectiveRatingDeviation: roundRating(ratingState.ratingDeviation),
      conservativeRating: roundRating(ratingState.rating - ratingState.ratingDeviation * 2),
      confidenceScore: 0,
      pairwiseWins: roundRating(aggregate.pairwiseWins),
      pairwiseMatches: roundRating(aggregate.pairwiseMatches),
      pairwiseWinRate: roundRating(pairwiseWinRate * 100),
      directOpponentCount: directOpponents.get(modelId)?.size ?? 0,
      nearbyOpponentCount: 0,
      nearbyCoveredOpponentCount: 0,
      provisional: aggregate.pairwiseMatches < PROVISIONAL_MATCH_THRESHOLD,
      averageFinalScore:
        aggregate.finalCount > 0 ? aggregate.finalScoreTotal / aggregate.finalCount : 0,
      averageFinalRank:
        aggregate.finalCount > 0 ? aggregate.finalRankTotal / aggregate.finalCount : 0,
    };
  });

  const ratingSortedEntries = [...rawEntries].sort(
    (a, b) =>
      b.rating - a.rating ||
      a.averageFinalRank - b.averageFinalRank ||
      b.pairwiseWinRate - a.pairwiseWinRate ||
      b.wins - a.wins,
  );

  const ratingOrderIndex = new Map(ratingSortedEntries.map((entry, index) => [entry.modelId, index]));

  const adjustedEntries = rawEntries.map((entry) => {
    const index = ratingOrderIndex.get(entry.modelId) ?? 0;
    const nearbyIds = ratingSortedEntries
      .slice(Math.max(0, index - NEARBY_WINDOW), Math.min(ratingSortedEntries.length, index + NEARBY_WINDOW + 1))
      .filter((candidate) => candidate.modelId !== entry.modelId)
      .map((candidate) => candidate.modelId);
    const nearbyCoveredOpponentCount = nearbyIds.filter(
      (opponentId) => (directMatchups.get(pairKey(entry.modelId, opponentId))?.directRuns ?? 0) > 0,
    ).length;
    const nearbyOpponentCount = nearbyIds.length;
    const nearbyCoverageRate =
      nearbyOpponentCount > 0 ? nearbyCoveredOpponentCount / nearbyOpponentCount : 0;
    const sparseDirectPenalty = Math.max(0, 3 - entry.directOpponentCount) * 12;
    const nearbyPenalty =
      nearbyOpponentCount > 0 ? Math.round((1 - nearbyCoverageRate) * 48) : 48;
    const lowSamplePenalty = entry.pairwiseMatches < 4 ? Math.round((4 - entry.pairwiseMatches) * 6) : 0;
    const effectiveRatingDeviation = clamp(
      entry.ratingDeviation + sparseDirectPenalty + nearbyPenalty + lowSamplePenalty,
      MIN_RD,
      MAX_RD,
    );
    const conservativeRating = entry.rating - effectiveRatingDeviation * 2;
    const confidenceScore =
      100 *
      clamp(
        1 - (effectiveRatingDeviation - MIN_RD) / (MAX_RD - MIN_RD),
        0,
        1,
      );

    return {
      ...entry,
      effectiveRatingDeviation: roundRating(effectiveRatingDeviation),
      conservativeRating: roundRating(conservativeRating),
      confidenceScore: roundPercent(confidenceScore),
      nearbyOpponentCount,
      nearbyCoveredOpponentCount,
      provisional:
        entry.pairwiseMatches < PROVISIONAL_MATCH_THRESHOLD ||
        nearbyCoveredOpponentCount === 0,
    };
  });

  const entries = adjustedEntries.sort(
    (a, b) =>
      b.conservativeRating - a.conservativeRating ||
      b.rating - a.rating ||
      a.averageFinalRank - b.averageFinalRank ||
      b.pairwiseWinRate - a.pairwiseWinRate ||
      b.wins - a.wins,
  );

  return {
    entries,
    insights: buildInsights(entries, directMatchups, categoryId),
  };
}

export function buildLeaderboardDataFromRecords(
  runs: LeaderboardRunRecord[],
  votePhase: LeaderboardVotePhase = "final",
): LeaderboardData {
  const completedRuns = runs.filter((run) => run.status === "complete" || run.status === "partial");
  const rankedRuns = completedRuns.filter((run) => isRankedRun(run, votePhase));
  const byCategory: Record<string, LeaderboardEntry[]> = {};
  const byCategoryInsights: LeaderboardData["byCategoryInsights"] = {};
  const categoryTotals: LeaderboardData["categoryTotals"] = {};

  for (const categoryId of new Set(rankedRuns.map((run) => run.categoryId))) {
    const categoryRuns = rankedRuns.filter((run) => run.categoryId === categoryId);
    const computation = buildLeaderboardComputation(categoryRuns, votePhase, categoryId);
    byCategory[categoryId] = computation.entries;
    byCategoryInsights[categoryId] = computation.insights;
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

  const globalComputation = buildLeaderboardComputation(rankedRuns, votePhase);

  for (const category of categories) {
    if (!byCategoryInsights[category.id]) {
      byCategoryInsights[category.id] = {
        featuredMatchups: [],
        coverageGaps: [],
      };
    }
  }

  return {
    votePhase,
    global: globalComputation.entries,
    byCategory,
    insights: globalComputation.insights,
    byCategoryInsights,
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
