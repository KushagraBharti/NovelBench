"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { LeaderboardData, LeaderboardVotePhase, RunExportEntry } from "@/types";
import { categories } from "@/lib/categories";
import RankingsTable from "@/components/leaderboard/RankingsTable";
import CategoryFilter from "@/components/leaderboard/CategoryFilter";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

const votePhaseLabels: Record<LeaderboardVotePhase, string> = {
  final: "Final vote",
  initial: "1st vote",
};

function getSuggestedPrompt(categoryId: string) {
  const category = categories.find((entry) => entry.id === categoryId);
  return (
    category?.examplePrompts.find((prompt) => !prompt.toLowerCase().startsWith("no prompt")) ??
    category?.examplePrompts[0] ??
    "Create a strong benchmark prompt."
  );
}

function buildArenaHref(categoryId: string, modelIds: string[]) {
  const params = new URLSearchParams({
    category: categoryId,
    models: modelIds.join(","),
    prompt: getSuggestedPrompt(categoryId),
  });
  return `/arena?${params.toString()}`;
}

export default function LeaderboardClient({
  finalData,
  initialData,
}: {
  finalData: LeaderboardData;
  initialData: LeaderboardData;
}) {
  const { isAuthenticated } = useConvexAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedVotePhase, setSelectedVotePhase] = useState<LeaderboardVotePhase>("final");
  const [showHeadToHead, setShowHeadToHead] = useState(false);
  const [showCoverageGaps, setShowCoverageGaps] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [showExports, setShowExports] = useState(false);
  const data = selectedVotePhase === "final" ? finalData : initialData;
  const requestLeaderboardExport = useMutation(api.exports.requestLeaderboardExport);
  const leaderboardExports = useQuery(
    api.exports.listLeaderboard,
    isAuthenticated && showExports
      ? {
          categoryId: selectedCategory === "all" ? undefined : selectedCategory,
          votePhase: selectedVotePhase,
        }
      : "skip",
  );
  const categoryIds = Array.from(
    new Set([...Object.keys(finalData.byCategory), ...Object.keys(initialData.byCategory)]),
  ).sort();
  const totalRuns = data.totals.runs;
  const topModel = data.global[0];
  const selectedInsights =
    selectedCategory === "all"
      ? data.insights
      : data.byCategoryInsights[selectedCategory] ?? {
          featuredMatchups: [],
          coverageGaps: [],
        };
  const completedExports = ((leaderboardExports ?? []) as RunExportEntry[]).filter(
    (entry) => entry.status === "complete" && entry.downloadUrl,
  );

  function getCategoryRuns(categoryId: string): number {
    return data.categoryTotals[categoryId]?.runs ?? 0;
  }

  function queueExport(format: "json" | "csv") {
    setShowExports(true);
    setExportMessage(`Queueing ${format.toUpperCase()} leaderboard export...`);
    void requestLeaderboardExport({
      format,
      categoryId: selectedCategory === "all" ? undefined : selectedCategory,
      votePhase: selectedVotePhase,
    })
      .then(() => setExportMessage(`${format.toUpperCase()} leaderboard export queued.`))
      .catch((error) => {
        setExportMessage(error instanceof Error ? error.message : "Failed to queue leaderboard export.");
      });
  }

  if (data.global.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center min-h-[50vh] text-center"
      >
        <p className="font-display text-6xl text-text-muted/20 mb-6">—</p>
        <h2 className="font-display text-2xl text-text-secondary mb-2">No Rankings Yet</h2>
        <p className="text-base text-text-muted mb-6 max-w-xs">
          Run your first benchmark to see how the models stack up.
        </p>
        <Link href="/arena" className="text-base text-accent hover:text-accent-hover transition-colors">
          Enter the Arena &rarr;
        </Link>
      </motion.div>
    );
  }

  const stats = [
    { label: "Runs", value: totalRuns },
    { label: "Ideas", value: data.totals.ideas },
    { label: "Leader", displayText: topModel?.modelName ?? "—" },
    { label: "Top Rating", value: topModel?.rating ?? 0, decimals: 0 },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
      {/* Stats — clean horizontal display */}
      <div className="flex flex-wrap gap-x-12 gap-y-6 border-b border-border pb-8">
        {stats.map((stat) => (
          <div key={stat.label}>
            <span className="label block mb-2">{stat.label}</span>
            {"displayText" in stat && stat.displayText ? (
              <span className="font-display text-2xl text-text-primary">{stat.displayText}</span>
            ) : (
              <AnimatedNumber
                value={stat.value ?? 0}
                decimals={stat.decimals ?? 0}
                className="font-mono text-2xl text-text-primary"
              />
            )}
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {(["final", "initial"] as const).map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => setSelectedVotePhase(phase)}
              className={
                selectedVotePhase === phase
                  ? "text-sm uppercase tracking-[0.18em] text-text-primary transition-colors"
                  : "text-sm uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-secondary"
              }
            >
              {votePhaseLabels[phase]}
            </button>
          ))}
        </div>
        <CategoryFilter
          categories={categoryIds}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          totalRuns={totalRuns}
          getCategoryRuns={getCategoryRuns}
        />
      </div>

      {/* Rankings */}
      {selectedCategory === "all" ? (
        <RankingsTable
          entries={data.global}
          title="Global Leaderboard"
          subtitle={`${votePhaseLabels[selectedVotePhase]} standing across ${totalRuns} ranked benchmark${totalRuns === 1 ? "" : "s"}`}
        />
      ) : (
        <RankingsTable
          entries={data.byCategory[selectedCategory] || []}
          title={`${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Leaderboard`}
          subtitle={`${votePhaseLabels[selectedVotePhase]} standing across ${getCategoryRuns(selectedCategory)} ranked benchmark${getCategoryRuns(selectedCategory) === 1 ? "" : "s"} in this category`}
        />
      )}

      {(selectedInsights.featuredMatchups.length > 0 || selectedInsights.coverageGaps.length > 0) ? (
        <div className="border-t border-border pt-8 space-y-8">
          {selectedInsights.featuredMatchups.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowHeadToHead((current) => !current)}
                className="mb-4 flex items-center gap-3 text-left"
              >
                <span className="label">Head-to-Head Coverage</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {selectedInsights.featuredMatchups.length}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {showHeadToHead ? "Hide" : "Show"}
                </span>
              </button>
              {showHeadToHead ? (
                <div className="border-t border-border">
                  {selectedInsights.featuredMatchups.map((matchup) => (
                    <div
                      key={`${matchup.modelAId}:${matchup.modelBId}`}
                      className="grid grid-cols-1 gap-3 border-t border-border/40 py-4 sm:grid-cols-[1fr_88px]"
                    >
                      <div>
                        <p className="text-base text-text-primary">
                          {matchup.modelAName} vs {matchup.modelBName}
                        </p>
                        <p className="mt-1 text-sm text-text-muted">
                          {matchup.directRuns === 0
                            ? "No direct head-to-head run yet. This ordering is still inferred."
                            : `Direct score ${matchup.modelAScore.toFixed(1)} to ${matchup.modelBScore.toFixed(1)} across ${matchup.directRuns} run${matchup.directRuns === 1 ? "" : "s"}.`}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-mono text-sm uppercase tracking-[0.16em] text-text-secondary">
                          {matchup.coverageLevel}
                        </p>
                        <p className="mt-1 font-mono text-sm text-text-muted">
                          {matchup.directRuns} run{matchup.directRuns === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedInsights.coverageGaps.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowCoverageGaps((current) => !current)}
                className="mb-4 flex items-center gap-3 text-left"
              >
                <span className="label">Coverage Gaps</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {selectedInsights.coverageGaps.length}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {showCoverageGaps ? "Hide" : "Show"}
                </span>
              </button>
              {showCoverageGaps ? (
                <div className="border-t border-border">
                  {selectedInsights.coverageGaps.map((gap) => (
                    <div
                      key={`${gap.higherModelId}:${gap.lowerModelId}`}
                      className="space-y-3 border-t border-border/40 py-4"
                    >
                      <div className="flex flex-col gap-1">
                        <p className="text-base text-text-primary">
                          {gap.higherModelName} vs {gap.lowerModelName}
                        </p>
                        <p className="text-sm text-text-muted">{gap.reason}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted">
                          direct runs {gap.directRuns}
                        </span>
                        {gap.suggestedCategoryIds.map((categoryId) => (
                          <Link
                            key={`${gap.higherModelId}:${gap.lowerModelId}:${categoryId}`}
                            href={buildArenaHref(categoryId, [gap.higherModelId, gap.lowerModelId])}
                            className="text-sm uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary"
                          >
                            Run {categoryId}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Exports */}
      {isAuthenticated ? (
        <div className="border-t border-border pt-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="label">Export</span>
            {!showExports ? (
              <button
                type="button"
                onClick={() => setShowExports(true)}
                className="text-sm uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary"
              >
                Show downloads
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => queueExport("json")}
              className="text-sm uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary"
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => queueExport("csv")}
              className="text-sm uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary"
            >
              CSV
            </button>
            {completedExports.map((entry) => (
              <a
                key={entry.id}
                href={entry.downloadUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent transition-colors hover:text-accent-hover"
              >
                Download {entry.format.toUpperCase()}
              </a>
            ))}
          </div>
          {exportMessage ? <p className="mt-3 text-sm text-text-muted">{exportMessage}</p> : null}
        </div>
      ) : null}
    </motion.div>
  );
}
