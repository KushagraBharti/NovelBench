"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { BenchmarkRun } from "@/types";
import { getCategoryIdentity } from "@/utils/category-identity";
import { useBenchmarkSSE } from "@/hooks/useBenchmarkSSE";
import { formatDateTime } from "@/lib/dates";
import ArenaRunner from "@/components/arena/ArenaRunner";
import HumanCritiquePanel from "@/components/arena/HumanCritiquePanel";
import ResultsView from "@/components/results/ResultsView";
import Button from "@/components/ui/Button";

export default function RunDetailClient({
  runId,
  initialRun,
  canEdit,
}: {
  runId: string;
  initialRun: BenchmarkRun;
  canEdit: boolean;
}) {
  const router = useRouter();
  const live = useBenchmarkSSE();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const pendingRunId = window.sessionStorage.getItem("novelbench:pending-arena-run");
      if (pendingRunId === runId) {
        window.sessionStorage.removeItem("novelbench:pending-arena-run");
      }
    }
  }, [runId]);

  useEffect(() => {
    live.attachToRun(initialRun);
  }, [initialRun]);

  const activeRun = live.result ?? initialRun;
  const category = getCategoryIdentity(activeRun.categoryId);
  const canPause = canEdit && ["queued", "generating", "critiquing", "revising", "voting"].includes(activeRun.status);
  const canResume = canEdit && activeRun.status === "paused";
  const canCancel =
    canEdit &&
    (activeRun.status === "paused" ||
      activeRun.status === "awaiting_human_critique" ||
      ["queued", "generating", "critiquing", "revising", "voting"].includes(activeRun.status));
  const canDelete =
    canEdit &&
    ["complete", "partial", "canceled", "dead_lettered", "error"].includes(activeRun.status);

  async function handleDelete() {
    if (deleteText !== "DELETE") {
      toast.error('Type "DELETE" to confirm');
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch(`/api/benchmark/${runId}/delete`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      toast.success("Run permanently deleted");
      router.replace("/archive");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/archive"
          className="inline-block text-base text-text-muted transition-colors hover:text-text-secondary"
        >
          &larr; Archive
        </Link>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8 space-y-8">
        <div className="border-t border-border pt-8">
          <div className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted">
                  {activeRun.categoryId}
                </span>
              </div>
              <h1 className="max-w-4xl font-display text-3xl leading-tight text-text-primary sm:text-4xl">
                Benchmark run
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-text-secondary">{activeRun.prompt}</p>
            </div>

            <div className="space-y-2 text-left sm:text-right">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
                {activeRun.status.replaceAll("_", " ")}
              </p>
              <p className="font-mono text-sm text-text-muted">
                {formatDateTime(activeRun.timestamp)}
              </p>
            </div>
          </div>

          {canEdit ? (
            <div className="flex flex-col gap-4 border-b border-border/60 py-5">
              <div className="flex flex-wrap items-center gap-3">
                {canPause ? (
                  <Button type="button" variant="ghost" onClick={() => void live.pauseBenchmark()}>
                    Pause
                  </Button>
                ) : null}
                {canResume ? (
                  <Button type="button" variant="ghost" onClick={() => void live.resumeBenchmark()}>
                    Resume
                  </Button>
                ) : null}
                {canCancel && !confirmCancel ? (
                  <Button type="button" variant="ghost" onClick={() => setConfirmCancel(true)}>
                    Cancel
                  </Button>
                ) : null}
                {canDelete && !deleteOpen ? (
                  <Button type="button" variant="ghost" onClick={() => setDeleteOpen(true)}>
                    Delete
                  </Button>
                ) : null}
              </div>

              {confirmCancel ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
                  <span>Cancel this run and release its slot?</span>
                  <button
                    type="button"
                    onClick={() => void live.cancelBenchmark().then(() => setConfirmCancel(false))}
                    className="text-[11px] uppercase tracking-[0.18em] text-[#D8A8A8] transition-colors hover:text-[#F0CCCC]"
                  >
                    Confirm cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    className="text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary"
                  >
                    Back
                  </button>
                </div>
              ) : null}

              {deleteOpen ? (
                <div className="space-y-3 border-l border-[#7C3E3E]/45 pl-4">
                  <p className="text-sm leading-relaxed text-[#E7C4C4]">
                    Hard delete permanently removes the run, artifacts, exports, events, jobs, and derived archive data.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      value={deleteText}
                      onChange={(event) => setDeleteText(event.target.value)}
                      placeholder='Type "DELETE"'
                      className="w-full max-w-xs border-0 border-b border-border/70 bg-transparent px-0 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => void handleDelete()}
                        className="text-[11px] uppercase tracking-[0.18em] text-[#D8A8A8] transition-colors hover:text-[#F0CCCC] disabled:opacity-35"
                      >
                        {deleting ? "Deleting..." : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => {
                          setDeleteOpen(false);
                          setDeleteText("");
                        }}
                        className="text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary disabled:opacity-35"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <ArenaRunner status={activeRun.status} step={activeRun.currentStep} run={activeRun} />

        {activeRun.status === "awaiting_human_critique" && canEdit ? (
          <HumanCritiquePanel
            run={activeRun}
            onSubmit={async (critiques) => {
              await live.submitHumanCritiques(critiques);
            }}
            onProceed={async () => {
              await live.proceedBenchmark();
            }}
          />
        ) : null}

        <ResultsView
          run={activeRun}
          isLive={live.isRunning}
          streamingText={live.streamingText}
          toolActivity={live.toolActivity}
          reasoningActivity={live.reasoningActivity}
        />
      </motion.div>
    </div>
  );
}
