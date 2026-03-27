"use client";

import { startTransition, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { toast } from "sonner";
import type { BenchmarkRunSummary, BenchmarkStatus } from "@/types";
import { formatShortDate } from "@/lib/dates";
import { getCategoryIdentity } from "@/utils/category-identity";

type StatusOption = {
  value: string;
  label: string;
};

type ListFilters = {
  query: string;
  categoryId: string;
  status: string;
  from: string;
  to: string;
};

interface RunListClientProps {
  basePath: "/runs" | "/archive";
  mode: "runs" | "archive";
  runs: BenchmarkRunSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  totalMatchingRuns: number;
  categoryCounts: Record<string, number>;
  filters: ListFilters;
  statusOptions: StatusOption[];
}

const ACTIVE_STATUSES: BenchmarkStatus[] = [
  "queued",
  "paused",
  "generating",
  "critiquing",
  "awaiting_human_critique",
  "revising",
  "voting",
];

function buildHref(basePath: string, args: ListFilters & { cursor?: string | null }) {
  const params = new URLSearchParams();
  if (args.query) params.set("q", args.query);
  if (args.categoryId && args.categoryId !== "all") params.set("category", args.categoryId);
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  if (args.cursor) params.set("cursor", args.cursor);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function isActiveStatus(status: BenchmarkStatus) {
  return ACTIVE_STATUSES.includes(status);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function RunRowActions({
  run,
  mode,
}: {
  run: BenchmarkRunSummary;
  mode: "runs" | "archive";
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"pause" | "resume" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (mode !== "runs" || !run.canEdit) {
    return null;
  }

  const canPause = ["queued", "generating", "critiquing", "revising", "voting"].includes(run.status);
  const canResume = run.status === "paused";
  const canCancel =
    run.status === "paused" ||
    run.status === "awaiting_human_critique" ||
    ["queued", "generating", "critiquing", "revising", "voting"].includes(run.status);

  async function performAction(action: "pause" | "resume" | "cancel") {
    setBusyAction(action);
    try {
      const response = await fetch(`/api/benchmark/${run.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      toast.success(
        action === "pause"
          ? "Run paused"
          : action === "resume"
            ? "Run resumed"
            : "Run canceled",
      );
      startTransition(() => {
        router.refresh();
      });
      setConfirmCancel(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Run action failed");
    } finally {
      setBusyAction(null);
    }
  }

  if (!canPause && !canResume && !canCancel) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      {canPause ? (
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void performAction("pause");
          }}
          className="text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary disabled:opacity-35"
        >
          Pause
        </button>
      ) : null}
      {canResume ? (
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void performAction("resume");
          }}
          className="text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary disabled:opacity-35"
        >
          Resume
        </button>
      ) : null}
      {canCancel ? (
        confirmCancel ? (
          <>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void performAction("cancel");
              }}
              className="text-[11px] uppercase tracking-[0.18em] text-[#D8A8A8] transition-colors hover:text-[#F0CCCC] disabled:opacity-35"
            >
              Confirm cancel
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setConfirmCancel(false);
              }}
              className="text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary disabled:opacity-35"
            >
              Back
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setConfirmCancel(true);
            }}
            className="text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-[#D8A8A8] disabled:opacity-35"
          >
            Cancel
          </button>
        )
      ) : null}
    </div>
  );
}

export default function RunListClient({
  basePath,
  mode,
  runs,
  nextCursor,
  hasMore,
  totalMatchingRuns,
  categoryCounts,
  filters,
  statusOptions,
}: RunListClientProps) {
  const categories = useMemo(() => Object.keys(categoryCounts).sort(), [categoryCounts]);
  const allRunsCount = useMemo(
    () => Object.values(categoryCounts).reduce((sum, count) => sum + count, 0) || totalMatchingRuns,
    [categoryCounts, totalMatchingRuns],
  );
  const displayRuns = useMemo(() => {
    if (mode !== "runs") {
      return runs;
    }
    const active = runs.filter((run) => isActiveStatus(run.status));
    const terminal = runs.filter((run) => !isActiveStatus(run.status));
    return [...active, ...terminal];
  }, [mode, runs]);

  if (runs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-[50vh] flex-col items-center justify-center text-center"
      >
        <p className="mb-6 font-display text-6xl text-text-muted/20">—</p>
        <h2 className="mb-2 font-display text-2xl text-text-secondary">
          {mode === "runs" ? "No Runs Yet" : "No Archived Runs"}
        </h2>
        <p className="mb-6 max-w-xs text-base text-text-muted">
          {mode === "runs"
            ? "Launch a benchmark and it will appear here with live status and controls."
            : "Terminal runs will appear here once benchmarks finish, fail, or are canceled."}
        </p>
        <Link href="/arena" className="text-base text-accent transition-colors hover:text-accent-hover">
          New Benchmark &rarr;
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <form action={basePath} method="get" className="border-y border-border/80 py-5">
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
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
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
          <Link href={basePath} className="text-sm text-text-muted transition-colors hover:text-text-primary">
            Clear
          </Link>
        </div>
      </form>

      {categories.length > 1 ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border/70 pb-4">
          <Link
            href={buildHref(basePath, { ...filters, categoryId: "all", cursor: null })}
            className={clsx(
              "inline-flex items-center gap-2 border-b px-0 py-1 text-sm transition-colors",
              filters.categoryId === "all"
                ? "border-accent text-text-primary"
                : "border-transparent text-text-muted hover:border-border/60 hover:text-text-primary",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            All runs ({allRunsCount})
          </Link>
          {categories.map((catId) => {
            const identity = getCategoryIdentity(catId);
            const count = categoryCounts[catId] ?? 0;
            return (
              <Link
                key={catId}
                href={buildHref(basePath, { ...filters, categoryId: catId, cursor: null })}
                className={clsx(
                  "inline-flex items-center gap-2 border-b px-0 py-1 text-sm capitalize transition-colors",
                  filters.categoryId === catId
                    ? "text-text-primary"
                    : "border-transparent text-text-muted hover:border-border/60 hover:text-text-primary",
                )}
                style={filters.categoryId === catId ? { borderColor: `${identity.color}AA` } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: identity.color }} />
                {catId} <span className="text-text-muted">({count})</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="border-t border-border/70">
        {displayRuns.map((run, index) => {
          const identity = getCategoryIdentity(run.categoryId);
          return (
            <motion.div
              key={run.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.02 }}
            >
              <div className="group flex items-center gap-4 border-b border-border/50 px-1 py-5 transition-colors hover:bg-white/[0.02]">
                <Link href={`/run/${run.id}`} className="flex min-w-0 flex-1 items-center gap-4">
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
                      <span>{formatShortDate(run.timestamp)}</span>
                      {mode === "runs" && isActiveStatus(run.status) ? (
                        <>
                          <span className="hidden h-1 w-1 rounded-full bg-border sm:block" />
                          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                            in progress
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                </Link>
                <div className="flex flex-shrink-0 items-center gap-4">
                  <RunRowActions run={run} mode={mode} />
                  <Link href={`/run/${run.id}`} className="flex items-center gap-4">
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      {statusLabel(run.status)}
                    </span>
                    <span className="hidden w-28 shrink-0 text-right font-mono text-sm text-text-muted lg:block">
                      {formatShortDate(run.timestamp)}
                    </span>
                  </Link>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {hasMore && nextCursor ? (
        <div className="flex justify-end">
          <Link
            href={buildHref(basePath, { ...filters, categoryId: filters.categoryId, cursor: nextCursor })}
            className="text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            Next page &rarr;
          </Link>
        </div>
      ) : null}
    </motion.div>
  );
}
