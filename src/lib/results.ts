import { fetchArchiveSummaries, fetchLeaderboardData } from "./convex-server";
import type { LeaderboardVotePhase } from "@/types";

export async function getArchiveSummaries() {
  return fetchArchiveSummaries();
}

export async function getLeaderboardData(votePhase: LeaderboardVotePhase = "final") {
  return fetchLeaderboardData(votePhase);
}

export async function getHomeStats() {
  const leaderboard = await fetchLeaderboardData("final");

  return {
    totalRuns: leaderboard.totals.runs,
    totalIdeas: leaderboard.totals.ideas,
    totalCritiques: leaderboard.totals.critiques,
    totalModels: leaderboard.global.length,
  };
}
