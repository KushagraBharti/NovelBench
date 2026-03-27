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
import { getModelCatalog } from "@/lib/models";
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
const JUDGE_WEIGHT_NEUTRAL = 1;
const MIN_JUDGE_WEIGHT = 0.8;
const MAX_JUDGE_WEIGHT = 1.2;
const JUDGE_WEIGHT_CONFIDENCE_FLOOR = 45;
const JUDGE_WEIGHT_SCALE = 250;
const AUDIT_JUDGE_LIMIT = 6;

const MODEL_LAB_BY_ID = new Map(getModelCatalog().map((model) => [model.id, model.lab]));

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

function getModelLab(modelId: string) {
  return MODEL_LAB_BY_ID.get(modelId) ?? "Unknown";
}

function deterministicShuffle<T>(items: T[], seed: string) {
  const copy = [...items];
  let h = 0;
  for (let index = 0; index < seed.length; index += 1) {
    h = Math.imul(h ^ seed.charCodeAt(index), 2654435761);
  }

  function nextRand() {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRand() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }

  return copy;
}

function compareRankedModels(
  leftModelId: string,
  rightModelId: string,
  ranks: Map<string, number>,
) {
  const leftRank = ranks.get(leftModelId);
  const rightRank = ranks.get(rightModelId);
  if (leftRank == null || rightRank == null) {
    return null;
  }
  if (leftRank < rightRank) {
    return 1;
  }
  if (leftRank > rightRank) {
    return 0;
  }
  return 0.5;
}

function confidenceBucket(score: number): "low" | "medium" | "high" {
  if (score >= 70) {
    return "high";
  }
  if (score >= JUDGE_WEIGHT_CONFIDENCE_FLOOR) {
    return "medium";
  }
  return "low";
}

export interface LeaderboardRunRecord {
  runId: string;
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
  leftWeightedScoreTotal: number;
  rightWeightedScoreTotal: number;
  totalWeight: number;
  ballotCount: number;
};

type RuntimeState = {
  aggregates: Map<string, ModelAggregate>;
  ratingStates: Map<string, ModelRatingState>;
  directMatchups: Map<string, DirectMatchupAggregate>;
  directOpponents: Map<string, Set<string>>;
};

type StateBundle = {
  weighted: RuntimeState;
  unweighted: RuntimeState;
  audit: AuditAccumulator;
};

type JudgeContext = {
  rating: number;
  ratingDeviation: number;
  conservativeRating: number;
  confidenceScore: number;
  provisional: boolean;
  weight: number;
};

type JudgeAuditAggregate = {
  judgeModelId: string;
  totalEffectiveWeight: number;
  ballotCount: number;
  selfDeltaSum: number;
  selfWeight: number;
  sameLabDeltaSum: number;
  sameLabWeight: number;
  lowBucketWeight: number;
  mediumBucketWeight: number;
  highBucketWeight: number;
};

type AuditAccumulator = {
  votePhase: LeaderboardVotePhase;
  judgeAggregates: Map<string, JudgeAuditAggregate>;
  firstPositionScoreTotal: number;
  firstPositionWeightTotal: number;
  ballotCount: number;
};

type RunComparisonResult = {
  candidateIds: string[];
  perModelComparisons: Map<string, Map<string, ComparisonAggregate>>;
  perModelFinals: Map<string, { ranks: number[]; scores: number[] }>;
  pairComparisons: Array<{
    leftModelId: string;
    rightModelId: string;
    leftAverageScore: number;
    rightAverageScore: number;
  }>;
  winnerId: string | null;
};

function createRuntimeState(): RuntimeState {
  return {
    aggregates: new Map(),
    ratingStates: new Map(),
    directMatchups: new Map(),
    directOpponents: new Map(),
  };
}

function createAuditAccumulator(votePhase: LeaderboardVotePhase): AuditAccumulator {
  return {
    votePhase,
    judgeAggregates: new Map(),
    firstPositionScoreTotal: 0,
    firstPositionWeightTotal: 0,
    ballotCount: 0,
  };
}

function createStateBundle(votePhase: LeaderboardVotePhase): StateBundle {
  return {
    weighted: createRuntimeState(),
    unweighted: createRuntimeState(),
    audit: createAuditAccumulator(votePhase),
  };
}

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
        ballotMeta: vote.ballotMeta,
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
    leftWeightedScoreTotal: 0,
    rightWeightedScoreTotal: 0,
    totalWeight: 0,
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

function countAdjacentCoverage(
  entries: LeaderboardEntry[],
  directMatchups: Map<string, DirectMatchupAggregate>,
) {
  let covered = 0;
  const total = Math.max(0, entries.length - 1);
  for (let index = 0; index < entries.length - 1; index += 1) {
    const left = entries[index]!;
    const right = entries[index + 1]!;
    if ((directMatchups.get(pairKey(left.modelId, right.modelId))?.directRuns ?? 0) > 0) {
      covered += 1;
    }
  }
  return { covered, total };
}

function buildInsights(
  entries: LeaderboardEntry[],
  directMatchups: Map<string, DirectMatchupAggregate>,
  categoryId?: string,
  audit?: LeaderboardInsights["audit"],
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

  for (
    let index = 0;
    index < entries.length - 1 && featuredPairs.length < FEATURED_MATCHUP_LIMIT;
    index += 1
  ) {
    pushPair(entries[index]!.modelId, entries[index + 1]!.modelId);
  }

  for (const [leftModelId, rightModelId] of SPECIAL_MATCHUPS) {
    if (
      entries.some((entry) => entry.modelId === leftModelId) &&
      entries.some((entry) => entry.modelId === rightModelId)
    ) {
      pushPair(leftModelId, rightModelId);
    }
  }

  const coverageGaps: LeaderboardCoverageGap[] = featuredPairs
    .filter((matchup) => matchup.directRuns < 2)
    .sort(
      (left, right) =>
        left.directRuns - right.directRuns || left.pairwiseMatches - right.pairwiseMatches,
    )
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
    audit,
  };
}

function deriveEntriesFromState(state: RuntimeState): LeaderboardEntry[] {
  const rawEntries = [...state.aggregates.entries()].map(([modelId, aggregate]) => {
    const identity = getModelIdentity(modelId);
    const ratingState = getOrCreateRatingState(state.ratingStates, modelId);
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
      pairwiseWinRate: roundPercent(pairwiseWinRate * 100),
      directOpponentCount: state.directOpponents.get(modelId)?.size ?? 0,
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

  const ratingOrderIndex = new Map(
    ratingSortedEntries.map((entry, index) => [entry.modelId, index]),
  );

  const adjustedEntries = rawEntries.map((entry) => {
    const index = ratingOrderIndex.get(entry.modelId) ?? 0;
    const nearbyIds = ratingSortedEntries
      .slice(
        Math.max(0, index - NEARBY_WINDOW),
        Math.min(ratingSortedEntries.length, index + NEARBY_WINDOW + 1),
      )
      .filter((candidate) => candidate.modelId !== entry.modelId)
      .map((candidate) => candidate.modelId);
    const nearbyCoveredOpponentCount = nearbyIds.filter(
      (opponentId) =>
        (state.directMatchups.get(pairKey(entry.modelId, opponentId))?.directRuns ?? 0) > 0,
    ).length;
    const nearbyOpponentCount = nearbyIds.length;
    const nearbyCoverageRate =
      nearbyOpponentCount > 0 ? nearbyCoveredOpponentCount / nearbyOpponentCount : 0;
    const sparseDirectPenalty = Math.max(0, 3 - entry.directOpponentCount) * 12;
    const nearbyPenalty = nearbyOpponentCount > 0 ? Math.round((1 - nearbyCoverageRate) * 48) : 48;
    const lowSamplePenalty =
      entry.pairwiseMatches < 4 ? Math.round((4 - entry.pairwiseMatches) * 6) : 0;
    const effectiveRatingDeviation = clamp(
      entry.ratingDeviation + sparseDirectPenalty + nearbyPenalty + lowSamplePenalty,
      MIN_RD,
      MAX_RD,
    );
    const conservativeRating = entry.rating - effectiveRatingDeviation * 2;
    const confidenceScore =
      100 * clamp(1 - (effectiveRatingDeviation - MIN_RD) / (MAX_RD - MIN_RD), 0, 1);

    return {
      ...entry,
      effectiveRatingDeviation: roundRating(effectiveRatingDeviation),
      conservativeRating: roundRating(conservativeRating),
      confidenceScore: roundPercent(confidenceScore),
      nearbyOpponentCount,
      nearbyCoveredOpponentCount,
      provisional:
        entry.pairwiseMatches < PROVISIONAL_MATCH_THRESHOLD || nearbyCoveredOpponentCount === 0,
    };
  });

  return adjustedEntries.sort(
    (a, b) =>
      b.conservativeRating - a.conservativeRating ||
      b.rating - a.rating ||
      a.averageFinalRank - b.averageFinalRank ||
      b.pairwiseWinRate - a.pairwiseWinRate ||
      b.wins - a.wins,
  );
}

function neutralJudgeContext(): JudgeContext {
  return {
    rating: DEFAULT_RATING,
    ratingDeviation: DEFAULT_RD,
    conservativeRating: DEFAULT_RATING - DEFAULT_RD * 2,
    confidenceScore: 0,
    provisional: true,
    weight: JUDGE_WEIGHT_NEUTRAL,
  };
}

function computeJudgeWeight(entry: LeaderboardEntry | null) {
  if (!entry || entry.provisional || entry.confidenceScore < JUDGE_WEIGHT_CONFIDENCE_FLOOR) {
    return JUDGE_WEIGHT_NEUTRAL;
  }
  return clamp(
    1 + 0.2 * Math.tanh((entry.conservativeRating - DEFAULT_RATING) / JUDGE_WEIGHT_SCALE),
    MIN_JUDGE_WEIGHT,
    MAX_JUDGE_WEIGHT,
  );
}

function buildJudgeContextMap(canonicalFinalState: RuntimeState) {
  const contextMap = new Map<string, JudgeContext>();
  const entries = deriveEntriesFromState(canonicalFinalState);
  const entryMap = new Map(entries.map((entry) => [entry.modelId, entry]));

  for (const [modelId, ratingState] of canonicalFinalState.ratingStates.entries()) {
    const entry = entryMap.get(modelId) ?? null;
    contextMap.set(modelId, {
      rating: ratingState.rating,
      ratingDeviation: clamp(ratingState.ratingDeviation, MIN_RD, MAX_RD),
      conservativeRating: entry?.conservativeRating ?? DEFAULT_RATING - DEFAULT_RD * 2,
      confidenceScore: entry?.confidenceScore ?? 0,
      provisional: entry?.provisional ?? true,
      weight: computeJudgeWeight(entry),
    });
  }

  return contextMap;
}

function getOrCreateJudgeAuditAggregate(
  map: Map<string, JudgeAuditAggregate>,
  judgeModelId: string,
): JudgeAuditAggregate {
  const current = map.get(judgeModelId);
  if (current) {
    return current;
  }

  const next: JudgeAuditAggregate = {
    judgeModelId,
    totalEffectiveWeight: 0,
    ballotCount: 0,
    selfDeltaSum: 0,
    selfWeight: 0,
    sameLabDeltaSum: 0,
    sameLabWeight: 0,
    lowBucketWeight: 0,
    mediumBucketWeight: 0,
    highBucketWeight: 0,
  };
  map.set(judgeModelId, next);
  return next;
}

function resolvePresentedModelIds(
  run: LeaderboardRunRecord,
  votePhase: LeaderboardVotePhase,
  ranking: Ranking,
  candidateIds: string[],
) {
  const candidateIdSet = new Set(candidateIds);
  const phaseSeedPrefix = votePhase === "initial" ? "critique" : "vote";
  const baseIds = votePhase === "initial" ? run.ideaModelIds : run.revisedIdeaModelIds;
  const rawPresentedIds =
    ranking.ballotMeta?.presentedModelIds?.length
      ? ranking.ballotMeta.presentedModelIds
      : deterministicShuffle(baseIds, `${phaseSeedPrefix}:${ranking.judgeModelId}:${run.runId}`);
  const presentedIds = rawPresentedIds.filter((modelId) => candidateIdSet.has(modelId));
  const missingIds = candidateIds.filter((modelId) => !presentedIds.includes(modelId));
  return [...presentedIds, ...missingIds];
}

function recordBallotAudit(
  audit: AuditAccumulator,
  run: LeaderboardRunRecord,
  votePhase: LeaderboardVotePhase,
  ranking: Ranking,
  judgeContexts: Map<string, JudgeContext>,
  candidateIds: string[],
  ranks: Map<string, number>,
) {
  const judgeContext = judgeContexts.get(ranking.judgeModelId) ?? neutralJudgeContext();
  const judgeWeight = judgeContext.weight;
  const judgeAggregate = getOrCreateJudgeAuditAggregate(
    audit.judgeAggregates,
    ranking.judgeModelId,
  );
  judgeAggregate.totalEffectiveWeight += judgeWeight;
  judgeAggregate.ballotCount += 1;
  audit.ballotCount += 1;

  const bucket = confidenceBucket(judgeContext.confidenceScore);
  if (bucket === "low") {
    judgeAggregate.lowBucketWeight += judgeWeight;
  } else if (bucket === "medium") {
    judgeAggregate.mediumBucketWeight += judgeWeight;
  } else {
    judgeAggregate.highBucketWeight += judgeWeight;
  }

  const presentedModelIds = resolvePresentedModelIds(run, votePhase, ranking, candidateIds);
  if (presentedModelIds.length > 1) {
    const firstPresentedModelId = presentedModelIds[0]!;
    for (const opponentId of presentedModelIds.slice(1)) {
      const actualScore = compareRankedModels(firstPresentedModelId, opponentId, ranks);
      if (actualScore == null) {
        continue;
      }
      audit.firstPositionScoreTotal += actualScore * judgeWeight;
      audit.firstPositionWeightTotal += judgeWeight;
    }
  }

  if (candidateIds.includes(ranking.judgeModelId)) {
    for (const opponentId of candidateIds) {
      if (opponentId === ranking.judgeModelId) {
        continue;
      }
      const actualScore = compareRankedModels(ranking.judgeModelId, opponentId, ranks);
      if (actualScore == null) {
        continue;
      }
      const opponentContext = judgeContexts.get(opponentId) ?? neutralJudgeContext();
      const expectedScore = glickoExpected(
        judgeContext.rating,
        opponentContext.rating,
        opponentContext.ratingDeviation,
      );
      judgeAggregate.selfDeltaSum += (actualScore - expectedScore) * judgeWeight;
      judgeAggregate.selfWeight += judgeWeight;
    }
  }

  const judgeLab = getModelLab(ranking.judgeModelId);
  for (let leftIndex = 0; leftIndex < candidateIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidateIds.length; rightIndex += 1) {
      const leftModelId = candidateIds[leftIndex]!;
      const rightModelId = candidateIds[rightIndex]!;
      const leftSharesLab = getModelLab(leftModelId) === judgeLab;
      const rightSharesLab = getModelLab(rightModelId) === judgeLab;
      if (leftSharesLab === rightSharesLab) {
        continue;
      }

      const sameLabModelId = leftSharesLab ? leftModelId : rightModelId;
      const otherModelId = leftSharesLab ? rightModelId : leftModelId;
      const actualScore = compareRankedModels(sameLabModelId, otherModelId, ranks);
      if (actualScore == null) {
        continue;
      }
      const sameLabContext = judgeContexts.get(sameLabModelId) ?? neutralJudgeContext();
      const otherContext = judgeContexts.get(otherModelId) ?? neutralJudgeContext();
      const expectedScore = glickoExpected(
        sameLabContext.rating,
        otherContext.rating,
        otherContext.ratingDeviation,
      );
      judgeAggregate.sameLabDeltaSum += (actualScore - expectedScore) * judgeWeight;
      judgeAggregate.sameLabWeight += judgeWeight;
    }
  }
}

function buildRunComparisons(
  run: LeaderboardRunRecord,
  votePhase: LeaderboardVotePhase,
  judgeContexts: Map<string, JudgeContext>,
  weightingMode: "weighted" | "unweighted",
  audit?: AuditAccumulator,
): RunComparisonResult | null {
  const phaseRankings = getPhaseRankings(run, votePhase);
  if (phaseRankings.length === 0) {
    return null;
  }

  const candidateIds = getPhaseCandidateIds(run, votePhase);
  if (candidateIds.length <= 1) {
    return null;
  }

  const perModelComparisons = new Map<string, Map<string, ComparisonAggregate>>();
  const perModelFinals = new Map<string, { ranks: number[]; scores: number[] }>();
  const pairBallots = new Map<string, PairBallotAggregate>();

  for (const ranking of phaseRankings) {
    const entries = ranking.rankings.filter((entry) => candidateIds.includes(entry.modelId));
    const ranks = new Map(entries.map((entry) => [entry.modelId, entry.rank]));
    for (const entry of entries) {
      const finals = perModelFinals.get(entry.modelId) ?? { ranks: [], scores: [] };
      finals.ranks.push(entry.rank);
      finals.scores.push(entry.score);
      perModelFinals.set(entry.modelId, finals);
    }

    if (audit && weightingMode === "weighted") {
      recordBallotAudit(audit, run, votePhase, ranking, judgeContexts, candidateIds, ranks);
    }

    const judgeWeight =
      weightingMode === "weighted"
        ? judgeContexts.get(ranking.judgeModelId)?.weight ?? JUDGE_WEIGHT_NEUTRAL
        : JUDGE_WEIGHT_NEUTRAL;

    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const left = entries[leftIndex]!;
        const right = entries[rightIndex]!;
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
          pairAggregate.leftWeightedScoreTotal += leftScore * judgeWeight;
          pairAggregate.rightWeightedScoreTotal += rightScore * judgeWeight;
        } else {
          pairAggregate.leftWeightedScoreTotal += rightScore * judgeWeight;
          pairAggregate.rightWeightedScoreTotal += leftScore * judgeWeight;
        }
        pairAggregate.totalWeight += judgeWeight;
        pairAggregate.ballotCount += 1;
      }
    }
  }

  for (const pairAggregate of pairBallots.values()) {
    if (pairAggregate.totalWeight <= 0) {
      continue;
    }

    const leftAverageScore = pairAggregate.leftWeightedScoreTotal / pairAggregate.totalWeight;
    const rightAverageScore = pairAggregate.rightWeightedScoreTotal / pairAggregate.totalWeight;

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
    candidateIds,
    perModelComparisons,
    perModelFinals,
    pairComparisons: Array.from(pairBallots.values()).map((pairAggregate) => ({
      leftModelId: pairAggregate.leftModelId,
      rightModelId: pairAggregate.rightModelId,
      leftAverageScore:
        pairAggregate.totalWeight > 0
          ? pairAggregate.leftWeightedScoreTotal / pairAggregate.totalWeight
          : 0.5,
      rightAverageScore:
        pairAggregate.totalWeight > 0
          ? pairAggregate.rightWeightedScoreTotal / pairAggregate.totalWeight
          : 0.5,
    })),
    winnerId: getWinnerId(phaseRankings, candidateIds),
  };
}

function applyRunResultToState(state: RuntimeState, comparisonResult: RunComparisonResult) {
  for (const modelId of comparisonResult.candidateIds) {
    const finals = comparisonResult.perModelFinals.get(modelId);
    if (!finals || finals.ranks.length === 0) {
      continue;
    }

    const aggregate = getOrCreateAggregate(state.aggregates, modelId);
    aggregate.totalRuns += 1;
    aggregate.finalRankTotal += average(finals.ranks);
    aggregate.finalScoreTotal += average(finals.scores);
    aggregate.finalCount += 1;
    if (comparisonResult.winnerId === modelId) {
      aggregate.wins += 1;
    }
  }

  for (const comparison of comparisonResult.pairComparisons) {
    const matchup = getOrCreateDirectMatchupAggregate(
      state.directMatchups,
      comparison.leftModelId,
      comparison.rightModelId,
    );
    matchup.directRuns += 1;
    matchup.pairwiseMatches += 1;
    matchup.leftScore += comparison.leftAverageScore;
    matchup.rightScore += comparison.rightAverageScore;

    const leftOpponents = state.directOpponents.get(comparison.leftModelId) ?? new Set<string>();
    leftOpponents.add(comparison.rightModelId);
    state.directOpponents.set(comparison.leftModelId, leftOpponents);

    const rightOpponents = state.directOpponents.get(comparison.rightModelId) ?? new Set<string>();
    rightOpponents.add(comparison.leftModelId);
    state.directOpponents.set(comparison.rightModelId, rightOpponents);
  }

  const nextRunUpdates = new Map<string, ModelRatingState>();

  for (const [modelId, opponentMap] of comparisonResult.perModelComparisons.entries()) {
    const currentState = getOrCreateRatingState(state.ratingStates, modelId);
    const aggregate = getOrCreateAggregate(state.aggregates, modelId);
    const currentDeviation = clamp(currentState.ratingDeviation, MIN_RD, MAX_RD);

    let varianceTerm = 0;
    let deltaTerm = 0;

    for (const [opponentId, comparison] of opponentMap.entries()) {
      const opponentState = getOrCreateRatingState(state.ratingStates, opponentId);
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
    state.ratingStates.set(modelId, nextState);
  }
}

function buildAuditSummary(
  votePhase: LeaderboardVotePhase,
  weightedState: RuntimeState,
  unweightedState: RuntimeState,
  audit: AuditAccumulator,
): LeaderboardInsights["audit"] {
  const weightedEntries = deriveEntriesFromState(weightedState);
  const unweightedEntries = deriveEntriesFromState(unweightedState);
  const weightedIndex = new Map(weightedEntries.map((entry, index) => [entry.modelId, index]));
  const unweightedIndex = new Map(unweightedEntries.map((entry, index) => [entry.modelId, index]));
  let changedRanks = 0;
  let topMoverModelId: string | null = null;
  let topMoverModelName: string | null = null;
  let topMoverShift = 0;
  let topMoverRatingDelta = 0;

  for (const entry of weightedEntries) {
    const weightedPosition = weightedIndex.get(entry.modelId);
    const unweightedPosition = unweightedIndex.get(entry.modelId);
    if (weightedPosition == null || unweightedPosition == null) {
      continue;
    }
    const shift = unweightedPosition - weightedPosition;
    if (shift !== 0) {
      changedRanks += 1;
    }
    const unweightedEntry = unweightedEntries[unweightedPosition]!;
    const ratingDelta = entry.rating - unweightedEntry.rating;
    if (
      Math.abs(shift) > Math.abs(topMoverShift) ||
      (Math.abs(shift) === Math.abs(topMoverShift) && Math.abs(ratingDelta) > Math.abs(topMoverRatingDelta))
    ) {
      topMoverModelId = entry.modelId;
      topMoverModelName = entry.modelName;
      topMoverShift = shift;
      topMoverRatingDelta = roundRating(ratingDelta);
    }
  }

  let totalEffectiveBallotWeight = 0;
  let topJudgeModelId: string | null = null;
  let topJudgeWeight = 0;
  const judgeBias = [...audit.judgeAggregates.values()]
    .map((judgeAggregate) => {
      totalEffectiveBallotWeight += judgeAggregate.totalEffectiveWeight;
      if (judgeAggregate.totalEffectiveWeight > topJudgeWeight) {
        topJudgeWeight = judgeAggregate.totalEffectiveWeight;
        topJudgeModelId = judgeAggregate.judgeModelId;
      }

      const dominantBucketWeight = Math.max(
        judgeAggregate.lowBucketWeight,
        judgeAggregate.mediumBucketWeight,
        judgeAggregate.highBucketWeight,
      );
      const dominantBucket: "low" | "medium" | "high" =
        dominantBucketWeight === judgeAggregate.highBucketWeight
          ? "high"
          : dominantBucketWeight === judgeAggregate.mediumBucketWeight
            ? "medium"
            : "low";

      return {
        judgeModelId: judgeAggregate.judgeModelId,
        judgeModelName: getModelIdentity(judgeAggregate.judgeModelId).name,
        ballots: judgeAggregate.ballotCount,
        selfPreferenceDelta:
          judgeAggregate.selfWeight > 0
            ? roundRating(judgeAggregate.selfDeltaSum / judgeAggregate.selfWeight)
            : 0,
        sameLabPreferenceDelta:
          judgeAggregate.sameLabWeight > 0
            ? roundRating(judgeAggregate.sameLabDeltaSum / judgeAggregate.sameLabWeight)
            : 0,
        averageAppliedWeight:
          judgeAggregate.ballotCount > 0
            ? roundRating(judgeAggregate.totalEffectiveWeight / judgeAggregate.ballotCount)
            : JUDGE_WEIGHT_NEUTRAL,
        confidenceBucket: dominantBucket,
        sortMagnitude:
          Math.abs(
            judgeAggregate.selfWeight > 0
              ? judgeAggregate.selfDeltaSum / judgeAggregate.selfWeight
              : 0,
          ) +
          Math.abs(
            judgeAggregate.sameLabWeight > 0
              ? judgeAggregate.sameLabDeltaSum / judgeAggregate.sameLabWeight
              : 0,
          ),
      };
    })
    .sort((left, right) => right.sortMagnitude - left.sortMagnitude || right.ballots - left.ballots)
    .slice(0, AUDIT_JUDGE_LIMIT)
    .map(({ sortMagnitude: _sortMagnitude, ...entry }) => entry);

  const weightedInsights = buildInsights(weightedEntries, weightedState.directMatchups);
  const unweightedInsights = buildInsights(unweightedEntries, unweightedState.directMatchups);
  const weightedCoverage = countAdjacentCoverage(weightedEntries, weightedState.directMatchups);
  const unweightedCoverage = countAdjacentCoverage(unweightedEntries, unweightedState.directMatchups);
  const topJudgeModelName = topJudgeModelId ? getModelIdentity(topJudgeModelId).name : null;
  const firstPositionPairwiseRate =
    audit.firstPositionWeightTotal > 0
      ? audit.firstPositionScoreTotal / audit.firstPositionWeightTotal
      : 0.5;

  return {
    weightingEnabled: true,
    votePhase,
    judgeWeightRange: {
      min: MIN_JUDGE_WEIGHT,
      max: MAX_JUDGE_WEIGHT,
      neutral: JUDGE_WEIGHT_NEUTRAL,
    },
    weightedVsUnweightedDelta: {
      changedRanks,
      topMoverModelId,
      topMoverModelName,
      topMoverShift,
      topMoverRatingDelta,
    },
    influenceConcentration: {
      topJudgeModelId,
      topJudgeModelName,
      topJudgeShare:
        totalEffectiveBallotWeight > 0 ? roundRating(topJudgeWeight / totalEffectiveBallotWeight) : 0,
      totalEffectiveBallotWeight: roundRating(totalEffectiveBallotWeight),
      activeJudgeCount: audit.judgeAggregates.size,
    },
    firstPositionBias: {
      pairwiseRate: roundRating(firstPositionPairwiseRate),
      deltaFromNeutral: roundRating(firstPositionPairwiseRate - 0.5),
      ballotCount: audit.ballotCount,
      comparisonWeight: roundRating(audit.firstPositionWeightTotal),
    },
    judgeBias,
    directCoverage: {
      weightedGapCount: weightedInsights.coverageGaps.length,
      unweightedGapCount: unweightedInsights.coverageGaps.length,
      weightedAdjacentCovered: weightedCoverage.covered,
      weightedAdjacentTotal: weightedCoverage.total,
      unweightedAdjacentCovered: unweightedCoverage.covered,
      unweightedAdjacentTotal: unweightedCoverage.total,
    },
  };
}

function sortRunsChronologically(runs: LeaderboardRunRecord[]) {
  return [...runs].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt);
    const rightTime = Date.parse(right.updatedAt);
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.runId.localeCompare(right.runId);
  });
}

function getOrCreateCategoryBundle(
  map: Map<string, StateBundle>,
  categoryId: string,
  votePhase: LeaderboardVotePhase,
) {
  const current = map.get(categoryId);
  if (current) {
    return current;
  }

  const next = createStateBundle(votePhase);
  map.set(categoryId, next);
  return next;
}

function applyRunToBundle(
  bundle: StateBundle,
  run: LeaderboardRunRecord,
  votePhase: LeaderboardVotePhase,
  judgeContexts: Map<string, JudgeContext>,
) {
  const weightedResult = buildRunComparisons(
    run,
    votePhase,
    judgeContexts,
    "weighted",
    bundle.audit,
  );
  const unweightedResult = buildRunComparisons(run, votePhase, judgeContexts, "unweighted");
  if (!weightedResult || !unweightedResult) {
    return;
  }

  applyRunResultToState(bundle.weighted, weightedResult);
  applyRunResultToState(bundle.unweighted, unweightedResult);
}

type ComputedLeaderboardState = {
  globalInitial: StateBundle;
  globalFinal: StateBundle;
  categoryInitial: Map<string, StateBundle>;
  categoryFinal: Map<string, StateBundle>;
};

function computeLeaderboardState(runs: LeaderboardRunRecord[]): ComputedLeaderboardState {
  const eligibleRuns = sortRunsChronologically(
    runs.filter((run) => run.status === "complete" || run.status === "partial"),
  );
  const globalInitial = createStateBundle("initial");
  const globalFinal = createStateBundle("final");
  const categoryInitial = new Map<string, StateBundle>();
  const categoryFinal = new Map<string, StateBundle>();

  for (const run of eligibleRuns) {
    const judgeContexts = buildJudgeContextMap(globalFinal.weighted);

    if (isRankedRun(run, "initial")) {
      applyRunToBundle(globalInitial, run, "initial", judgeContexts);
      applyRunToBundle(
        getOrCreateCategoryBundle(categoryInitial, run.categoryId, "initial"),
        run,
        "initial",
        judgeContexts,
      );
    }

    if (isRankedRun(run, "final")) {
      applyRunToBundle(globalFinal, run, "final", judgeContexts);
      applyRunToBundle(
        getOrCreateCategoryBundle(categoryFinal, run.categoryId, "final"),
        run,
        "final",
        judgeContexts,
      );
    }
  }

  return {
    globalInitial,
    globalFinal,
    categoryInitial,
    categoryFinal,
  };
}

function buildTotals(
  runs: LeaderboardRunRecord[],
  votePhase: LeaderboardVotePhase,
): LeaderboardData["totals"] {
  return {
    runs: runs.length,
    ideas: runs.reduce(
      (sum, run) =>
        sum +
        (votePhase === "initial"
          ? run.ideaModelIds.length
          : run.ideaModelIds.length + run.revisedIdeaModelIds.length),
      0,
    ),
    critiques: runs.reduce(
      (sum, run) =>
        sum +
        run.critiqueVotes.reduce((voteSum, vote) => voteSum + vote.critiques.length, 0) +
        run.humanCritiqueCount,
      0,
    ),
    completedModels: runs.reduce((sum, run) => sum + run.completedModelCount, 0),
  };
}

export function buildLeaderboardDataFromRecords(
  runs: LeaderboardRunRecord[],
  votePhase: LeaderboardVotePhase = "final",
): LeaderboardData {
  const completedRuns = runs.filter((run) => run.status === "complete" || run.status === "partial");
  const rankedRuns = completedRuns.filter((run) => isRankedRun(run, votePhase));
  const computed = computeLeaderboardState(completedRuns);
  const globalBundle = votePhase === "initial" ? computed.globalInitial : computed.globalFinal;
  const categoryBundles = votePhase === "initial" ? computed.categoryInitial : computed.categoryFinal;

  const globalEntries = deriveEntriesFromState(globalBundle.weighted);
  const globalInsights = buildInsights(
    globalEntries,
    globalBundle.weighted.directMatchups,
    undefined,
    buildAuditSummary(votePhase, globalBundle.weighted, globalBundle.unweighted, globalBundle.audit),
  );

  const byCategory: Record<string, LeaderboardEntry[]> = {};
  const byCategoryInsights: LeaderboardData["byCategoryInsights"] = {};
  const categoryTotals: LeaderboardData["categoryTotals"] = {};

  for (const categoryId of new Set(rankedRuns.map((run) => run.categoryId))) {
    const categoryRuns = rankedRuns.filter((run) => run.categoryId === categoryId);
    const categoryBundle = categoryBundles.get(categoryId);
    const categoryEntries = categoryBundle ? deriveEntriesFromState(categoryBundle.weighted) : [];
    byCategory[categoryId] = categoryEntries;
    byCategoryInsights[categoryId] = categoryBundle
      ? buildInsights(
          categoryEntries,
          categoryBundle.weighted.directMatchups,
          categoryId,
          buildAuditSummary(
            votePhase,
            categoryBundle.weighted,
            categoryBundle.unweighted,
            categoryBundle.audit,
          ),
        )
      : {
          featuredMatchups: [],
          coverageGaps: [],
        };
    categoryTotals[categoryId] = buildTotals(categoryRuns, votePhase);
  }

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
    global: globalEntries,
    byCategory,
    insights: globalInsights,
    byCategoryInsights,
    categoryTotals,
    totals: buildTotals(rankedRuns, votePhase),
  };
}

export function buildLeaderboardData(
  runs: BenchmarkRun[],
  votePhase: LeaderboardVotePhase = "final",
): LeaderboardData {
  return buildLeaderboardDataFromRecords(
    runs.map((run) => ({
      runId: run.id,
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
