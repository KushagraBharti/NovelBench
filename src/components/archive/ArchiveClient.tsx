"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { BenchmarkRunSummary } from "@/types";
import { getCategoryIdentity } from "@/utils/category-identity";
import { StatusBadge } from "@/components/ui/Badge";

interface ArchiveClientProps {
  runs: BenchmarkRunSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  filters: {
    query: string;
    categoryId: string;
    status: string;
    from: string;
    to: string;
  };
}

function buildArchiveHref(args: ArchiveClientProps["filters"] & { cursor?: string | null }) {
  const params = new URLSearchParams();
  if (args.query) params.set("q", args.query);
  if (args.categoryId && args.categoryId !== "all") params.set("category", args.categoryId);
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  if (args.cursor) params.set("cursor", args.cursor);
  const query = params.toString();
  return query ? `/archive?${query}` : "/archive";
}

export default function ArchiveClient({ runs, nextCursor, hasMore, filters }: ArchiveClientProps) {
  const [filterCategory, setFilterCategory] = useState<string>(filters.categoryId);
  const categories = useMemo(() => Array.from(new Set(runs.map((run) => run.categoryId))).sort(), [runs]);
  const filteredRuns = useMemo(
    () => (filterCategory === "all" ? runs : runs.filter((run) => run.categoryId === filterCategory)),
    [filterCategory, runs],
  );

  if (runs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center min-h-[50vh] text-center"
      >
        <p className="font-display text-6xl text-text-muted/20 mb-6">—</p>
        <h2 className="font-display text-2xl text-text-secondary mb-2">No Benchmarks Yet</h2>
        <p className="text-base text-text-muted mb-6 max-w-xs">
          Run your first benchmark and it will appear here.
        </p>
        <Link href="/arena" className="text-base text-accent hover:text-accent-hover transition-colors">
          Enter the Arena &rarr;
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <form
        action="/archive"
        method="get"
        className="border-y border-border/80 py-5"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr]">
          <input
            type="search"
            name="q"
            defaultValue={filters.query}
            placeholder="Search prompts"
            className="w-full border-0 border-b border-border/70 bg-transparent px-0 py-3 text-base text-text-primary outline-none transition-colors placeholder:text-text-muted/45 focus:border-accent"
          />
          <select
            name="category"
            defaultValue={filters.categoryId}
            className="w-full border-0 border-b border-border/70 bg-transparent px-0 py-3 text-base text-text-primary outline-none transition-colors focus:border-accent"
          >
            <option value="all">All categories</option>
            {categories.map((categoryId) => (
              <option key={categoryId} value={categoryId}>
                {categoryId}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={filters.status}
            className="w-full border-0 border-b border-border/70 bg-transparent px-0 py-3 text-base text-text-primary outline-none transition-colors focus:border-accent"
          >
            <option value="all">All statuses</option>
            <option value="complete">Complete</option>
            <option value="partial">Partial</option>
            <option value="dead_lettered">Dead lettered</option>
            <option value="canceled">Canceled</option>
            <option value="error">Error</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              name="from"
              defaultValue={filters.from}
              className="w-full border-0 border-b border-border/70 bg-transparent px-0 py-3 text-base text-text-primary outline-none transition-colors focus:border-accent"
            />
            <input
              type="date"
              name="to"
              defaultValue={filters.to}
              className="w-full border-0 border-b border-border/70 bg-transparent px-0 py-3 text-base text-text-primary outline-none transition-colors focus:border-accent"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="border-b border-border/70 px-0 py-2 text-sm uppercase tracking-[0.18em] text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            Apply filters
          </button>
          <Link href="/archive" className="text-sm text-text-muted transition-colors hover:text-text-primary">
            Clear
          </Link>
        </div>
      </form>

      {categories.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border/70 pb-4">
          <button
            onClick={() => setFilterCategory("all")}
            className={clsx(
              "inline-flex items-center gap-2 border-b px-0 py-1 text-sm transition-colors",
              filterCategory === "all"
                ? "border-accent text-text-primary"
                : "border-transparent text-text-muted hover:border-border/60 hover:text-text-primary",
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            All runs ({runs.length})
          </button>
          {categories.map((catId) => {
            const identity = getCategoryIdentity(catId);
            const count = runs.filter((run) => run.categoryId === catId).length;
            return (
              <button
                key={catId}
                onClick={() => setFilterCategory(catId)}
                className={clsx(
                  "inline-flex items-center gap-2 border-b px-0 py-1 text-sm capitalize transition-colors",
                  filterCategory === catId
                    ? "text-text-primary"
                    : "border-transparent text-text-muted hover:border-border/60 hover:text-text-primary",
                )}
                style={filterCategory === catId ? { borderColor: `${identity.color}AA` } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: identity.color }} />
                {catId} <span className="text-text-muted">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t border-border/70">
        {filteredRuns.map((run, index) => {
          const identity = getCategoryIdentity(run.categoryId);
          return (
            <motion.div
              key={run.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.03 }}
            >
              <Link href={`/arena/${run.id}`}>
                <div className="group flex items-center gap-4 border-b border-border/50 px-1 py-5 transition-colors hover:bg-white/[0.02]">
                  <div className="flex w-36 flex-shrink-0 items-center gap-3">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: identity.color }} />
                    <span className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted">
                      {run.categoryId}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-base text-text-primary transition-colors group-hover:text-accent">
                      {run.prompt}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-muted">
                      <span>
                        {run.completedModelCount}/{run.modelCount} models completed
                      </span>
                      <span className="hidden h-1 w-1 rounded-full bg-border sm:block" />
                      <span>{new Date(run.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-4">
                    <StatusBadge status={run.status} />
                    <span className="hidden w-28 shrink-0 text-right font-mono text-sm text-text-muted lg:block">
                      {new Date(run.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {hasMore && nextCursor ? (
        <div className="flex justify-end">
          <Link
            href={buildArchiveHref({ ...filters, categoryId: filters.categoryId, cursor: nextCursor })}
            className="text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            Next page &rarr;
          </Link>
        </div>
      ) : null}
    </motion.div>
  );
}
