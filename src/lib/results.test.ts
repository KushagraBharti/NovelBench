import { beforeEach, describe, expect, it, vi } from "vitest";
import { BenchmarkRun } from "@/types";

const fetchLeaderboard = vi.fn();
const fetchArchive = vi.fn();

vi.mock("@/lib/convex-server", () => ({
  fetchArchiveSummaries: fetchArchive,
  fetchLeaderboardData: fetchLeaderboard,
}));

describe("results loaders", () => {
  beforeEach(() => {
    fetchLeaderboard.mockReset();
    fetchArchive.mockReset();
  });

  it("computes totals from actual run data", async () => {
    const run: BenchmarkRun = {
      id: "run_1",
      categoryId: "venture",
      prompt: "test",
      selectedModels: [],
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "complete",
      currentStep: "done",
      exposureMode: "public_full",
      ideas: [
        { modelId: "a", content: { title: "A", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: new Date().toISOString() },
        { modelId: "b", content: { title: "B", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: new Date().toISOString() },
      ],
      critiqueVotes: [
        {
          fromModelId: "a",
          critiques: [
            { ideaLabel: "B", targetModelId: "b", strengths: "", weaknesses: "", suggestions: "", score: 8 },
          ],
          rankings: [
            { modelId: "a", rank: 2, score: 7, reasoning: "" },
            { modelId: "b", rank: 1, score: 8, reasoning: "" },
          ],
        },
      ],
      humanCritiques: [],
      revisedIdeas: [
        { modelId: "a", content: { title: "A2", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: new Date().toISOString() },
        { modelId: "b", content: { title: "B2", summary: "", description: "", novelty: "" }, raw: "{}", timestamp: new Date().toISOString() },
      ],
      finalRankings: [
        {
          judgeModelId: "a",
          rankings: [
            { modelId: "a", rank: 2, score: 7, reasoning: "" },
            { modelId: "b", rank: 1, score: 9, reasoning: "" },
          ],
        },
      ],
      failedModels: [],
      modelStates: {},
      failures: [],
      checkpoint: { stage: "complete", completedModelIds: ["a", "b"], readyForRevisionModelIds: ["a", "b"], updatedAt: new Date().toISOString() },
      cancellation: { requested: false },
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
    };

    fetchArchive.mockResolvedValue([
      {
        id: run.id,
        categoryId: run.categoryId,
        prompt: run.prompt,
        timestamp: run.timestamp,
        updatedAt: run.updatedAt,
        status: run.status,
        modelCount: 2,
        completedModelCount: 2,
        failedModelCount: 0,
      },
    ]);
    fetchLeaderboard.mockResolvedValue({
      votePhase: "final",
      global: [
        {
          modelId: "b",
          modelName: "B",
          provider: "OpenAI",
          wins: 1,
          totalRuns: 1,
          rating: 1542,
          ratingDeviation: 142,
          conservativeRating: 1258,
          pairwiseWins: 1,
          pairwiseMatches: 1,
          pairwiseWinRate: 100,
          provisional: true,
          averageFinalScore: 9,
          averageFinalRank: 1,
        },
      ],
      byCategory: {
        venture: [],
      },
      categoryTotals: {
        venture: {
          runs: 1,
          ideas: 4,
          critiques: 1,
          completedModels: 2,
        },
      },
      totals: {
        ideas: 4,
        critiques: 1,
        runs: 1,
        completedModels: 2,
      },
    });

    const { getHomeStats, getLeaderboardData } = await import("@/lib/results");
    const leaderboard = await getLeaderboardData("final");
    const stats = await getHomeStats();

    expect(fetchLeaderboard).toHaveBeenCalledWith("final");
    expect(leaderboard.totals.ideas).toBe(4);
    expect(leaderboard.totals.critiques).toBe(1);
    expect(stats.totalRuns).toBe(1);
  });
});
