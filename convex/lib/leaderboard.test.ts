import { describe, expect, it } from "vitest";
import type { BenchmarkRun } from "@/types";
import { buildLeaderboardData } from "./leaderboard";

function isoAt(day: number, hour = 0) {
  return new Date(Date.UTC(2026, 0, day, hour)).toISOString();
}

function makeRun(overrides: Partial<BenchmarkRun> = {}): BenchmarkRun {
  const now = new Date().toISOString();
  return {
    id: "run_1",
    categoryId: "venture",
    prompt: "test prompt",
    selectedModels: [],
    timestamp: now,
    updatedAt: now,
    status: "complete",
    currentStep: "done",
    exposureMode: "public_full",
    ideas: [
      { modelId: "a", content: { title: "A", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
      { modelId: "b", content: { title: "B", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
    ],
    critiqueVotes: [
      {
        fromModelId: "a",
        critiques: [],
        rankings: [
          { modelId: "a", rank: 1, score: 9, reasoning: "" },
          { modelId: "b", rank: 2, score: 7, reasoning: "" },
        ],
      },
      {
        fromModelId: "b",
        critiques: [],
        rankings: [
          { modelId: "a", rank: 1, score: 8, reasoning: "" },
          { modelId: "b", rank: 2, score: 7, reasoning: "" },
        ],
      },
    ],
    humanCritiques: [],
    revisedIdeas: [
      { modelId: "a", content: { title: "A2", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
      { modelId: "b", content: { title: "B2", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
    ],
    finalRankings: [
      {
        judgeModelId: "a",
        rankings: [
          { modelId: "a", rank: 2, score: 8, reasoning: "" },
          { modelId: "b", rank: 1, score: 9, reasoning: "" },
        ],
      },
      {
        judgeModelId: "b",
        rankings: [
          { modelId: "a", rank: 2, score: 8, reasoning: "" },
          { modelId: "b", rank: 1, score: 9, reasoning: "" },
        ],
      },
    ],
    failedModels: [],
    modelStates: {
      a: { modelId: "a", stage: "complete", status: "complete" },
      b: { modelId: "b", stage: "complete", status: "complete" },
    },
    failures: [],
    checkpoint: {
      stage: "complete",
      completedModelIds: ["a", "b"],
      readyForRevisionModelIds: ["a", "b"],
      updatedAt: now,
    },
    cancellation: { requested: false },
    controls: {
      history: [],
      modelControls: {},
    },
    circuitBreaker: { status: "closed", failureCount: 0 },
    web: {
      config: {
        maxSearchCallsPerStagePerModel: 2,
        maxResultsPerSearch: 3,
        maxCharsPerResult: 12000,
        maxLoopTurns: 5,
      },
      toolCalls: [],
      retrievedSources: [],
      usage: [],
    },
    reasoning: {
      details: [],
    },
    metadata: { participantCount: 2, minimumSuccessfulModels: 2 },
    ...overrides,
  };
}

function makePairDominanceRun(
  id: string,
  updatedAt: string,
  winnerId: string,
  loserId: string,
  judgeModelId = winnerId,
): BenchmarkRun {
  return makeRun({
    id,
    updatedAt,
    ideas: [
      {
        modelId: winnerId,
        content: { title: "Winner", summary: "", description: "", novelty: "" },
        raw: "{}",
        timestamp: updatedAt,
      },
      {
        modelId: loserId,
        content: { title: "Loser", summary: "", description: "", novelty: "" },
        raw: "{}",
        timestamp: updatedAt,
      },
    ],
    revisedIdeas: [
      {
        modelId: winnerId,
        content: { title: "Winner 2", summary: "", description: "", novelty: "" },
        raw: "{}",
        timestamp: updatedAt,
      },
      {
        modelId: loserId,
        content: { title: "Loser 2", summary: "", description: "", novelty: "" },
        raw: "{}",
        timestamp: updatedAt,
      },
    ],
    critiqueVotes: [
      {
        fromModelId: winnerId,
        critiques: [],
        rankings: [
          { modelId: winnerId, rank: 1, score: 9, reasoning: "" },
          { modelId: loserId, rank: 2, score: 6, reasoning: "" },
        ],
      },
    ],
    finalRankings: [
      {
        judgeModelId,
        rankings: [
          { modelId: winnerId, rank: 1, score: 9, reasoning: "" },
          { modelId: loserId, rank: 2, score: 6, reasoning: "" },
        ],
      },
    ],
    modelStates: {
      [winnerId]: { modelId: winnerId, stage: "complete", status: "complete" },
      [loserId]: { modelId: loserId, stage: "complete", status: "complete" },
    },
    checkpoint: {
      stage: "complete",
      completedModelIds: [winnerId, loserId],
      readyForRevisionModelIds: [winnerId, loserId],
      updatedAt,
    },
    metadata: { participantCount: 2, minimumSuccessfulModels: 2 },
  });
}

function makeExternalJudgedRun(
  id: string,
  updatedAt: string,
  judgeBallots: Array<{
    judgeModelId: string;
    winnerId: string;
    loserId: string;
  }>,
): BenchmarkRun {
  const leftId = "claude-opus-4.6";
  const rightId = "claude-haiku-4.5";
  return makeRun({
    id,
    updatedAt,
    ideas: [
      {
        modelId: leftId,
        content: { title: "Opus", summary: "", description: "", novelty: "" },
        raw: "{}",
        timestamp: updatedAt,
      },
      {
        modelId: rightId,
        content: { title: "Haiku", summary: "", description: "", novelty: "" },
        raw: "{}",
        timestamp: updatedAt,
      },
    ],
    revisedIdeas: [
      {
        modelId: leftId,
        content: { title: "Opus 2", summary: "", description: "", novelty: "" },
        raw: "{}",
        timestamp: updatedAt,
      },
      {
        modelId: rightId,
        content: { title: "Haiku 2", summary: "", description: "", novelty: "" },
        raw: "{}",
        timestamp: updatedAt,
      },
    ],
    critiqueVotes: [],
    finalRankings: judgeBallots.map((ballot) => ({
      judgeModelId: ballot.judgeModelId,
      ballotMeta: { presentedModelIds: [leftId, rightId] },
      rankings: [
        { modelId: ballot.winnerId, rank: 1, score: 9, reasoning: "" },
        { modelId: ballot.loserId, rank: 2, score: 7, reasoning: "" },
      ],
    })),
    modelStates: {
      [leftId]: { modelId: leftId, stage: "complete", status: "complete" },
      [rightId]: { modelId: rightId, stage: "complete", status: "complete" },
    },
    checkpoint: {
      stage: "complete",
      completedModelIds: [leftId, rightId],
      readyForRevisionModelIds: [leftId, rightId],
      updatedAt,
    },
    metadata: { participantCount: 2, minimumSuccessfulModels: 2 },
  });
}

describe("buildLeaderboardData", () => {
  it("uses critique rankings for the initial vote phase", () => {
    const data = buildLeaderboardData([makeRun()], "initial");

    expect(data.votePhase).toBe("initial");
    expect(data.totals.runs).toBe(1);
    expect(data.global[0]?.modelId).toBe("a");
    expect(data.global[0]?.rating).toBeGreaterThan(data.global[1]?.rating ?? 0);
    expect(data.global[0]?.pairwiseMatches).toBe(1);
  });

  it("uses final rankings for the final vote phase", () => {
    const data = buildLeaderboardData([makeRun()], "final");

    expect(data.votePhase).toBe("final");
    expect(data.totals.runs).toBe(1);
    expect(data.global[0]?.modelId).toBe("b");
    expect(data.global[0]?.rating).toBeGreaterThan(data.global[1]?.rating ?? 0);
  });

  it("only counts ranked runs for the active vote phase", () => {
    const data = buildLeaderboardData(
      [
        makeRun(),
        makeRun({
          id: "run_2",
          critiqueVotes: [],
          finalRankings: [],
        }),
      ],
      "final",
    );

    expect(data.totals.runs).toBe(1);
    expect(data.categoryTotals.venture?.runs).toBe(1);
  });

  it("rescales the full history through pairwise transitivity", () => {
    const now = new Date().toISOString();
    const data = buildLeaderboardData(
      [
        makeRun({
          id: "run_ab",
          finalRankings: [
            {
              judgeModelId: "a",
              rankings: [
                { modelId: "a", rank: 1, score: 9, reasoning: "" },
                { modelId: "b", rank: 2, score: 7, reasoning: "" },
              ],
            },
          ],
        }),
        makeRun({
          id: "run_bc",
          updatedAt: now,
          ideas: [
            { modelId: "b", content: { title: "B", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
            { modelId: "c", content: { title: "C", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
          ],
          revisedIdeas: [
            { modelId: "b", content: { title: "B2", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
            { modelId: "c", content: { title: "C2", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
          ],
          critiqueVotes: [
            {
              fromModelId: "b",
              critiques: [],
              rankings: [
                { modelId: "b", rank: 1, score: 9, reasoning: "" },
                { modelId: "c", rank: 2, score: 7, reasoning: "" },
              ],
            },
          ],
          finalRankings: [
            {
              judgeModelId: "b",
              rankings: [
                { modelId: "b", rank: 1, score: 9, reasoning: "" },
                { modelId: "c", rank: 2, score: 7, reasoning: "" },
              ],
            },
          ],
          modelStates: {
            b: { modelId: "b", stage: "complete", status: "complete" },
            c: { modelId: "c", stage: "complete", status: "complete" },
          },
          checkpoint: {
            stage: "complete",
            completedModelIds: ["b", "c"],
            readyForRevisionModelIds: ["b", "c"],
            updatedAt: now,
          },
          metadata: { participantCount: 2, minimumSuccessfulModels: 2 },
        }),
      ],
      "final",
    );

    expect(data.global.map((entry) => entry.modelId)).toEqual(["a", "b", "c"]);
    expect(data.global[0]?.conservativeRating).toBeGreaterThan(data.global[1]?.conservativeRating ?? 0);
    expect(data.global[1]?.conservativeRating).toBeGreaterThan(data.global[2]?.conservativeRating ?? 0);
  });

  it("reduces confidence when ordering is only indirect", () => {
    const now = new Date().toISOString();
    const data = buildLeaderboardData(
      [
        makeRun({
          id: "run_ab_only",
          finalRankings: [
            {
              judgeModelId: "a",
              rankings: [
                { modelId: "a", rank: 1, score: 9, reasoning: "" },
                { modelId: "b", rank: 2, score: 7, reasoning: "" },
              ],
            },
          ],
        }),
        makeRun({
          id: "run_bc_only",
          updatedAt: now,
          ideas: [
            { modelId: "b", content: { title: "B", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
            { modelId: "c", content: { title: "C", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
          ],
          revisedIdeas: [
            { modelId: "b", content: { title: "B2", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
            { modelId: "c", content: { title: "C2", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: now },
          ],
          critiqueVotes: [
            {
              fromModelId: "b",
              critiques: [],
              rankings: [
                { modelId: "b", rank: 1, score: 9, reasoning: "" },
                { modelId: "c", rank: 2, score: 7, reasoning: "" },
              ],
            },
          ],
          finalRankings: [
            {
              judgeModelId: "b",
              rankings: [
                { modelId: "b", rank: 1, score: 9, reasoning: "" },
                { modelId: "c", rank: 2, score: 7, reasoning: "" },
              ],
            },
          ],
          modelStates: {
            b: { modelId: "b", stage: "complete", status: "complete" },
            c: { modelId: "c", stage: "complete", status: "complete" },
          },
          checkpoint: {
            stage: "complete",
            completedModelIds: ["b", "c"],
            readyForRevisionModelIds: ["b", "c"],
            updatedAt: now,
          },
          metadata: { participantCount: 2, minimumSuccessfulModels: 2 },
        }),
      ],
      "final",
    );

    const topEntry = data.global.find((entry) => entry.modelId === "a");
    expect(topEntry?.directOpponentCount).toBe(1);
    expect(topEntry?.confidenceScore).toBeLessThan(70);
    expect(data.insights.coverageGaps.length).toBeGreaterThan(0);
  });

  it("uses bounded judge weights from the pre-run final ladder", () => {
    const priorRuns = [
      ...Array.from({ length: 3 }, (_, index) =>
        makePairDominanceRun(
          `gpt_over_grok_${index + 1}`,
          isoAt(index + 1),
          "gpt-5.4",
          "grok-4.20-beta",
          "claude-sonnet-4.6",
        ),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        makePairDominanceRun(
          `gpt_over_flash_${index + 1}`,
          isoAt(index + 4),
          "gpt-5.4",
          "gemini-3.1-flash-lite-preview",
          "claude-sonnet-4.6",
        ),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        makePairDominanceRun(
          `gpt_over_mini_${index + 1}`,
          isoAt(index + 7),
          "gpt-5.4",
          "gpt-5.4-mini",
          "claude-sonnet-4.6",
        ),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        makePairDominanceRun(
          `flash_over_grok_${index + 1}`,
          isoAt(index + 9),
          "gemini-3.1-flash-lite-preview",
          "grok-4.20-beta",
          "claude-sonnet-4.6",
        ),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        makePairDominanceRun(
          `mini_over_grok_${index + 1}`,
          isoAt(index + 12),
          "gpt-5.4-mini",
          "grok-4.20-beta",
          "claude-sonnet-4.6",
        ),
      ),
    ];
    const targetRun = makeExternalJudgedRun("target", isoAt(20), [
      {
        judgeModelId: "gpt-5.4",
        winnerId: "claude-opus-4.6",
        loserId: "claude-haiku-4.5",
      },
      {
        judgeModelId: "grok-4.20-beta",
        winnerId: "claude-haiku-4.5",
        loserId: "claude-opus-4.6",
      },
    ]);

    const data = buildLeaderboardData([...priorRuns, targetRun], "final");
    const audit = data.insights.audit;
    const gptBias = audit?.judgeBias.find((entry) => entry.judgeModelId === "gpt-5.4");
    const grokBias = audit?.judgeBias.find((entry) => entry.judgeModelId === "grok-4.20-beta");
    const opusEntry = data.global.find((entry) => entry.modelId === "claude-opus-4.6");
    const haikuEntry = data.global.find((entry) => entry.modelId === "claude-haiku-4.5");

    expect(audit?.judgeWeightRange.min).toBe(0.8);
    expect(audit?.judgeWeightRange.max).toBe(1.2);
    expect(gptBias?.confidenceBucket).toBe("medium");
    expect(grokBias?.averageAppliedWeight).toBe(0.8);
    expect(["claude-opus-4.6", "claude-haiku-4.5"]).toContain(
      audit?.weightedVsUnweightedDelta.topMoverModelId,
    );
    expect(Math.abs(audit?.weightedVsUnweightedDelta.topMoverRatingDelta ?? 0)).toBeGreaterThan(0);
    expect(opusEntry?.pairwiseWins ?? 0).toBeGreaterThan(0.5);
    expect(haikuEntry?.pairwiseWins ?? 1).toBeLessThan(0.5);
    expect(opusEntry?.conservativeRating ?? 0).toBeGreaterThan(haikuEntry?.conservativeRating ?? 0);
  });

  it("keeps provisional and low-confidence judges neutral", () => {
    const data = buildLeaderboardData(
      [
        makePairDominanceRun(
          "prior_once_external",
          isoAt(1),
          "gpt-5.4",
          "grok-4.20-beta",
          "claude-sonnet-4.6",
        ),
        makeExternalJudgedRun("target", isoAt(2), [
          {
            judgeModelId: "gpt-5.4",
            winnerId: "claude-opus-4.6",
            loserId: "claude-haiku-4.5",
          },
          {
            judgeModelId: "grok-4.20-beta",
            winnerId: "claude-haiku-4.5",
            loserId: "claude-opus-4.6",
          },
        ]),
      ],
      "final",
    );

    const audit = data.insights.audit;
    expect(audit?.weightedVsUnweightedDelta.changedRanks).toBe(0);
    expect(
      audit?.judgeBias.find((entry) => entry.judgeModelId === "gpt-5.4")?.averageAppliedWeight,
    ).toBe(1);
    expect(
      audit?.judgeBias.find((entry) => entry.judgeModelId === "grok-4.20-beta")
        ?.averageAppliedWeight,
    ).toBe(1);
  });

  it("rebuilds deterministically from run timestamps instead of input order", () => {
    const target = makeExternalJudgedRun("target_early", isoAt(1), [
      {
        judgeModelId: "gpt-5.4",
        winnerId: "claude-opus-4.6",
        loserId: "claude-haiku-4.5",
      },
      {
        judgeModelId: "grok-4.20-beta",
        winnerId: "claude-haiku-4.5",
        loserId: "claude-opus-4.6",
      },
    ]);
    const laterRuns = Array.from({ length: 8 }, (_, index) =>
      makePairDominanceRun(
        `later_${index + 1}`,
        isoAt(index + 2),
        "gpt-5.4",
        "grok-4.20-beta",
        "claude-sonnet-4.6",
      ),
    );

    const ordered = buildLeaderboardData([target, ...laterRuns], "final");
    const reversed = buildLeaderboardData([...laterRuns].reverse().concat(target), "final");

    expect(ordered.global).toEqual(reversed.global);
    expect(ordered.insights.audit).toEqual(reversed.insights.audit);
  });
});
