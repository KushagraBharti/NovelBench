"use client";

import { motion } from "framer-motion";
import { BenchmarkStatus, RunCheckpointStage } from "@/types";
import { clsx } from "clsx";

const stages: { status: BenchmarkStatus; label: string; number: string }[] = [
  { status: "generating", label: "Generate", number: "01" },
  { status: "critiquing", label: "Critique", number: "02" },
  { status: "revising", label: "Revise", number: "03" },
  { status: "voting", label: "Crown", number: "04" },
];

function getStageIndex(status: BenchmarkStatus): number {
  const idx = stages.findIndex((s) => s.status === status);
  if (status === "complete") return stages.length;
  if (status === "error") return -1;
  return idx;
}

function mapCheckpointStageToStatus(stage?: RunCheckpointStage): BenchmarkStatus | null {
  if (!stage) return null;
  switch (stage) {
    case "generate":
      return "generating";
    case "critique":
      return "critiquing";
    case "human_critique":
      return "awaiting_human_critique";
    case "revise":
      return "revising";
    case "vote":
      return "voting";
    case "complete":
      return "complete";
    default:
      return null;
  }
}

export default function StageOrbs({
  status,
  checkpointStage,
}: {
  status: BenchmarkStatus;
  checkpointStage?: RunCheckpointStage;
}) {
  const effectiveStatus =
    ["paused", "partial", "dead_lettered"].includes(status)
      ? mapCheckpointStageToStatus(checkpointStage) ?? status
      : status;
  const currentIndex = getStageIndex(effectiveStatus);

  return (
    <div className="grid grid-cols-4 gap-0">
      {stages.map((stage, i) => {
        const isComplete = currentIndex > i;
        const isCurrent = currentIndex === i;

        return (
          <div key={stage.status} className="relative">
            {/* Top progress line */}
            <div className="h-px w-full bg-border/40 mb-4">
              {(isComplete || isCurrent) && (
                <motion.div
                  className={clsx("h-full", isComplete ? "bg-accent/60" : "bg-text-primary")}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  style={{ transformOrigin: "left" }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
                />
              )}
            </div>

            <div className="pr-4">
              <span
                className={clsx(
                  "font-mono text-[11px] tracking-[0.2em] transition-colors duration-300",
                  isComplete && "text-accent/60",
                  isCurrent && "text-text-primary",
                  !isComplete && !isCurrent && "text-text-muted/25",
                )}
              >
                {stage.number}
              </span>
              <p
                className={clsx(
                  "text-base mt-1 transition-colors duration-300",
                  isComplete && "text-text-secondary",
                  isCurrent && "text-text-primary font-medium",
                  !isComplete && !isCurrent && "text-text-muted/30",
                )}
              >
                {stage.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
