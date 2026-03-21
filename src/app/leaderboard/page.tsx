import LeaderboardClient from "@/components/leaderboard/LeaderboardClient";
import AuthAwareLink from "@/components/auth/AuthAwareLink";
import { getLeaderboardData } from "@/lib/results";

export default async function LeaderboardPage() {
  const data = await getLeaderboardData();

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl text-text-primary">Rankings</h1>
          <p className="text-text-secondary text-base mt-2">
            Aggregated performance across all benchmark runs
          </p>
        </div>
        <AuthAwareLink
          href="/arena"
          className="text-base text-text-muted hover:text-accent transition-colors"
          signedInChildren="New Benchmark →"
          signedOutChildren="Sign in to compete →"
        >
          New Benchmark &rarr;
        </AuthAwareLink>
      </div>

      <LeaderboardClient data={data} />
    </div>
  );
}
