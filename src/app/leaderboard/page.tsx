import LeaderboardClient from "@/components/leaderboard/LeaderboardClient";
import AuthAwareLink from "@/components/auth/AuthAwareLink";
import { getLeaderboardData } from "@/lib/results";

export const revalidate = 60;

export default async function LeaderboardPage() {
  const [finalData, initialData] = await Promise.all([
    getLeaderboardData("final"),
    getLeaderboardData("initial"),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-16">
        <div>
          <p className="label mb-3">Leaderboard</p>
          <h1 className="font-display text-4xl sm:text-5xl text-text-primary">Rankings</h1>
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

      <LeaderboardClient finalData={finalData} initialData={initialData} />
    </div>
  );
}
