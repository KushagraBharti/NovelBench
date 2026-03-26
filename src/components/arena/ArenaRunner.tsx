"use client";

import { motion } from "framer-motion";
import { BenchmarkRun, BenchmarkStatus } from "@/types";
import StageOrbs from "./StageOrbs";
import ModelStatusGrid from "./ModelStatusGrid";
import Button from "@/components/ui/Button";

const stageLabels: Record<string, string> = {
  queued: "Queued",
  paused: "Paused",
  generating: "Generating ideas",
  critiquing: "Critiquing & voting",
  awaiting_human_critique: "Awaiting your critique",
  revising: "Revising ideas",
  voting: "Final judgment",
  complete: "Complete",
  partial: "Partial result",
  canceled: "Canceled",
  dead_lettered: "Needs retry",
  error: "Error",
};

export default function ArenaRunner({
  status,
  step,
  run,
  onPauseRun,
  onResumeRun,
  onCancelRun,
  onRestartRun,
}: {
  status: BenchmarkStatus;
  step: string;
  run: BenchmarkRun | null;
  onPauseRun?: () => Promise<void> | void;
  onResumeRun?: () => Promise<void> | void;
  onCancelRun?: () => Promise<void> | void;
  onRestartRun?: () => Promise<void> | void;
}) {
  const canPause = ["queued", "generating", "critiquing", "revising", "voting"].includes(status);
  const canResume = ["paused", "error", "dead_lettered", "partial"].includes(status);
  const canCancel = ["queued", "generating", "critiquing", "revising", "voting", "paused"].includes(status);
  const canRestart = ["paused", "error", "dead_lettered", "partial", "complete", "canceled"].includes(status);
  const hasControls = (canPause && onPauseRun) || (canResume && onResumeRun) || (canCancel && onCancelRun) || (canRestart && onRestartRun);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Progress stages */}
      <StageOrbs status={status} checkpointStage={run?.checkpoint.stage} />

      {/* Status + controls row */}
      <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
        <div className="min-w-0">
          <motion.p
            key={status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-display text-xl text-text-primary"
          >
            {stageLabels[status] ?? status}
          </motion.p>
          <motion.p
            key={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-text-muted mt-0.5"
          >
            {step}
          </motion.p>
        </div>

        {hasControls && (
          <div className="flex items-center gap-2 shrink-0">
            {canPause && onPauseRun && (
              <Button type="button" variant="ghost" onClick={() => void onPauseRun()}>
                Pause
              </Button>
            )}
            {canResume && onResumeRun && (
              <Button type="button" variant="ghost" onClick={() => void onResumeRun()}>
                Resume
              </Button>
            )}
            {canCancel && onCancelRun && (
              <Button type="button" variant="ghost" onClick={() => void onCancelRun()}>
                Cancel
              </Button>
            )}
            {canRestart && onRestartRun && (
              <Button type="button" variant="ghost" onClick={() => void onRestartRun()}>
                Restart
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Model status */}
      <ModelStatusGrid run={run} status={status} />
    </motion.div>
  );
}
