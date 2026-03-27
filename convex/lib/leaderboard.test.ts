import { describe, expect, it } from "vitest";
import type { BenchmarkRun } from "@/types";
import { buildLeaderboardData } from "./leaderboard";

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

describe("buildLeaderboardData", () => {
  it("uses critique rankings for the initial vote phase", () => {
    const data = buildLeaderboardData([makeRun()], "initial");

    expect(data.votePhase).toBe("initial");
    expect(data.totals.runs).toBe(1);
    expect(data.global[0]?.modelId).toBe("a");
    expect(data.global[0]?.rating).toBeGreaterThan(data.global[1]?.rating ?? 0);
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
});
