"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { LeaderboardData, RunExportEntry } from "@/types";
import RankingsTable from "@/components/leaderboard/RankingsTable";
import CategoryFilter from "@/components/leaderboard/CategoryFilter";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

export default function LeaderboardClient({ data }: { data: LeaderboardData }) {
  const { isAuthenticated } = useConvexAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const requestLeaderboardExport = useMutation(api.exports.requestLeaderboardExport);
  const leaderboardExports = useQuery(
    api.exports.listLeaderboard,
    isAuthenticated
      ? { categoryId: selectedCategory === "all" ? undefined : selectedCategory }
      : "skip",
  );
  const categoryIds = Object.keys(data.byCategory).sort();
  const totalRuns = data.totals.runs;
  const topModel = data.global[0];
  const completedExports = ((leaderboardExports ?? []) as RunExportEntry[]).filter(
    (entry) => entry.status === "complete" && entry.downloadUrl,
  );

  function getCategoryRuns(categoryId: string): number {
    return data.categoryTotals[categoryId]?.runs ?? 0;
  }

  function queueExport(format: "json" | "csv") {
    setExportMessage(`Queueing ${format.toUpperCase()} leaderboard export...`);
    void requestLeaderboardExport({
      format,
      categoryId: selectedCategory === "all" ? undefined : selectedCategory,
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
        {[
          { label: "Runs", value: totalRuns },
          { label: "Ideas", value: data.totals.ideas },
          { label: "Leader", displayText: topModel?.modelName ?? "—" },
          { label: "Top Composite", value: topModel?.compositeScore ?? 0, decimals: 1 },
        ].map((stat) => (
          <div key={stat.label} className="bg-bg-deep p-5">
            <span className="label block mb-2">{stat.label}</span>
            {"displayText" in stat && stat.displayText ? (
              <span className="font-display text-xl text-text-primary">{stat.displayText}</span>
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

      <CategoryFilter
        categories={categoryIds}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        totalRuns={totalRuns}
        getCategoryRuns={getCategoryRuns}
      />

      {selectedCategory === "all" ? (
        <RankingsTable
          entries={data.global}
          title="Global Leaderboard"
          subtitle={`Composite standing built from final placements, final ratings, and critique ratings across ${totalRuns} benchmark${totalRuns === 1 ? "" : "s"}`}
        />
      ) : (
        <RankingsTable
          entries={data.byCategory[selectedCategory] || []}
          title={`${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Leaderboard`}
          subtitle={`Composite standing across ${getCategoryRuns(selectedCategory)} run${getCategoryRuns(selectedCategory) === 1 ? "" : "s"} in this category`}
        />
      )}

      {isAuthenticated ? (
        <div className="border-t border-border/70 pt-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="label">Exports</span>
            <button
              type="button"
              onClick={() => queueExport("json")}
              className="text-sm uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary"
            >
              Queue {selectedCategory === "all" ? "Global" : selectedCategory} JSON
            </button>
            <button
              type="button"
              onClick={() => queueExport("csv")}
              className="text-sm uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary"
            >
              Queue {selectedCategory === "all" ? "Global" : selectedCategory} CSV
            </button>
            {completedExports.map((entry) => (
              <a
                key={entry.id}
                href={entry.downloadUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-text-muted transition-colors hover:text-text-primary"
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
