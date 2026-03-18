"use client";

import { motion } from "framer-motion";
import { BenchmarkRun, BenchmarkStatus } from "@/types";
import StageOrbs from "./StageOrbs";
import ModelStatusGrid from "./ModelStatusGrid";

const stageLabels: Record<string, string> = {
  generating: "Generating ideas",
  critiquing: "Critiquing & voting",
  revising: "Revising ideas",
  voting: "Final judgment",
  complete: "Complete",
  error: "Error",
};

export default function ArenaRunner({
  status,
  step,
  run,
}: {
  status: BenchmarkStatus;
  step: string;
  run: BenchmarkRun | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Progress */}
      <div className="border border-border rounded-lg p-6">
        <StageOrbs status={status} />
      </div>

      {/* Status */}
      <div className="text-center space-y-1">
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
          className="text-base text-text-muted"
        >
          {step}
        </motion.p>
      </div>

      {/* Model status */}
      <ModelStatusGrid run={run} status={status} />
    </motion.div>
  );
}
