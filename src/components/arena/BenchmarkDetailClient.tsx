"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BenchmarkRun } from "@/types";
import ResultsView from "@/components/results/ResultsView";
import { useBenchmarkSSE } from "@/hooks/useBenchmarkSSE";
import ArenaRunner from "@/components/arena/ArenaRunner";
import HumanCritiquePanel from "@/components/arena/HumanCritiquePanel";

export default function BenchmarkDetailClient({
  runId,
  initialRun,
}: {
  runId: string;
  initialRun: BenchmarkRun;
}) {
  const router = useRouter();
  const live = useBenchmarkSSE();

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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/archive"
          className="text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          &larr; Archive
        </Link>
        <span className="text-border">/</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
          {activeRun.status.replaceAll("_", " ")}
        </span>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
        <ArenaRunner
          status={activeRun.status}
          step={activeRun.currentStep}
          run={activeRun}
          onPauseRun={() => live.pauseBenchmark()}
          onResumeRun={() => live.resumeBenchmark()}
          onCancelRun={() => live.cancelBenchmark()}
          onRestartRun={async () => {
            const next = await live.restartBenchmark();
            if (next?.id && next.id !== runId) {
              router.push(`/arena/${next.id}`);
            }
          }}
        />
        {activeRun.status === "awaiting_human_critique" && (
          <HumanCritiquePanel
            run={activeRun}
            onSubmit={async (critiques) => {
              await live.submitHumanCritiques(critiques);
            }}
            onProceed={async () => {
              await live.proceedBenchmark();
            }}
          />
        )}
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
