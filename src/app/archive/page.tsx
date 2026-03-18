"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BenchmarkStatus } from "@/types";
import { getCategoryIdentity } from "@/utils/category-identity";
import { StatusBadge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Skeleton";

interface RunSummary {
  id: string;
  categoryId: string;
  prompt: string;
  timestamp: string;
  status: BenchmarkStatus;
  modelCount: number;
}

export default function ArchivePage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/results");
        if (response.ok) {
          setRuns(await response.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const categories = Array.from(new Set(runs.map((r) => r.categoryId))).sort();
  const filteredRuns =
    filterCategory === "all"
      ? runs
      : runs.filter((r) => r.categoryId === filterCategory);

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
            Archive
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-text-secondary text-base mt-2"
          >
            Browse all past benchmark runs
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
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : runs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center min-h-[50vh] text-center"
        >
          <p className="font-display text-6xl text-text-muted/20 mb-6">&mdash;</p>
          <h2 className="font-display text-2xl text-text-secondary mb-2">
            No Benchmarks Yet
          </h2>
          <p className="text-base text-text-muted mb-6 max-w-xs">
            Run your first benchmark and it will appear here.
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
          className="space-y-6"
        >
          {/* Category filter */}
          {categories.length > 1 && (
            <div className="flex gap-4 flex-wrap border-b border-border pb-3">
              <button
                onClick={() => setFilterCategory("all")}
                className={`text-base transition-colors ${
                  filterCategory === "all"
                    ? "text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                All ({runs.length})
              </button>
              {categories.map((catId) => {
                const identity = getCategoryIdentity(catId);
                const count = runs.filter((r) => r.categoryId === catId).length;
                return (
                  <button
                    key={catId}
                    onClick={() => setFilterCategory(catId)}
                    className="flex items-center gap-1.5 text-base transition-colors capitalize"
                    style={{
                      color:
                        filterCategory === catId
                          ? identity.color
                          : "var(--color-text-muted)",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: identity.color }}
                    />
                    {catId} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Results — list rows, not cards */}
          <div className="border-t border-border">
            {filteredRuns.map((run, i) => {
              const identity = getCategoryIdentity(run.categoryId);
              return (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link href={`/arena/${run.id}`}>
                    <div className="flex items-center gap-4 py-4 border-b border-border/50 hover:bg-bg-surface/30 transition-colors group cursor-pointer px-1">
                      {/* Category dot + name */}
                      <div className="flex items-center gap-2 w-24 flex-shrink-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: identity.color }}
                        />
                        <span className="text-base text-text-muted capitalize font-mono">
                          {run.categoryId}
                        </span>
                      </div>

                      {/* Prompt */}
                      <p className="text-base text-text-primary flex-1 line-clamp-1 group-hover:text-accent transition-colors">
                        {run.prompt}
                      </p>

                      {/* Status */}
                      <StatusBadge status={run.status} />

                      {/* Meta */}
                      <span className="text-base font-mono text-text-muted w-28 text-right flex-shrink-0">
                        {new Date(run.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
