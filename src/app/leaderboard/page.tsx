"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LeaderboardData } from "@/types";
import RankingsTable from "@/components/leaderboard/RankingsTable";
import CategoryFilter from "@/components/leaderboard/CategoryFilter";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { SkeletonCard } from "@/components/ui/Skeleton";

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/leaderboard");
        if (response.ok) {
          setData(await response.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const categoryIds = data ? Object.keys(data.byCategory).sort() : [];
  const totalRuns =
    data?.global.reduce((sum, e) => Math.max(sum, e.totalRuns), 0) ?? 0;
  const topModel = data?.global[0];

  function getCategoryRuns(catId: string): number {
    return data?.byCategory[catId]?.[0]?.totalRuns ?? 0;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-4xl sm:text-5xl text-text-primary"
          >
            Rankings
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-text-secondary text-base mt-2"
          >
            Aggregated performance across all benchmark runs
          </motion.p>
        </div>
        <Link
          href="/arena"
          className="text-base text-text-muted hover:text-accent transition-colors"
        >
          New Benchmark &rarr;
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !data || data.global.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center min-h-[50vh] text-center"
        >
          <p className="font-display text-6xl text-text-muted/20 mb-6">&mdash;</p>
          <h2 className="font-display text-2xl text-text-secondary mb-2">
            No Rankings Yet
          </h2>
          <p className="text-base text-text-muted mb-6 max-w-xs">
            Run your first benchmark to see how the models stack up.
          </p>
          <Link
            href="/arena"
            className="text-base text-accent hover:text-accent-hover transition-colors"
          >
            Enter the Arena &rarr;
          </Link>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          {/* Stats — typographic, no icon cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
            {[
              { label: "Runs", value: totalRuns },
              { label: "Ideas", value: totalRuns * 4 },
              { label: "Leader", displayText: topModel?.modelName ?? "—" },
              { label: "Top Score", value: topModel?.averageScore ?? 0, decimals: 1 },
            ].map((stat) => (
              <div key={stat.label} className="bg-bg-deep p-5">
                <span className="label block mb-2">{stat.label}</span>
                {"displayText" in stat && stat.displayText ? (
                  <span className="font-display text-xl text-text-primary">
                    {stat.displayText}
                  </span>
                ) : (
                  <AnimatedNumber
                    value={stat.value!}
                    decimals={stat.decimals ?? 0}
                    className="font-mono text-2xl text-text-primary"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Category filter */}
          <CategoryFilter
            categories={categoryIds}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            totalRuns={totalRuns}
            getCategoryRuns={getCategoryRuns}
          />

          {/* Rankings table */}
          {selectedCategory === "all" ? (
            <RankingsTable
              entries={data.global}
              title="Global Leaderboard"
              subtitle={`Based on ${totalRuns} completed benchmark${totalRuns !== 1 ? "s" : ""}`}
            />
          ) : (
            <RankingsTable
              entries={data.byCategory[selectedCategory] || []}
              title={`${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Leaderboard`}
              subtitle={`${getCategoryRuns(selectedCategory)} runs in this category`}
            />
          )}
        </motion.div>
      )}
    </div>
  );
}
