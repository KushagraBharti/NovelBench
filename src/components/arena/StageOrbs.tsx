"use client";

import { CSSProperties } from "react";
import { motion } from "framer-motion";
import { BenchmarkStatus, RunCheckpointStage } from "@/types";
import { clsx } from "clsx";

const stages: { status: BenchmarkStatus; label: string; number: string; color: string }[] = [
  { status: "generating", label: "Generate", number: "01", color: "#7AA2F7" },
  { status: "critiquing", label: "Critique", number: "02", color: "#C9A84C" },
  { status: "revising", label: "Revise", number: "03", color: "#BB9AF7" },
  { status: "voting", label: "Crown", number: "04", color: "#D4634A" },
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
        const progressStyle: CSSProperties = {
          backgroundColor: stage.color,
          opacity: isComplete ? 0.5 : 1,
        };

        return (
          <div key={stage.status} className="relative">
            {/* Top progress line — colored per stage */}
            <div className="h-[2px] w-full bg-border/20 mb-4">
              {(isComplete || isCurrent) && (
                <motion.div
                  className="h-full origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  style={progressStyle}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
                />
              )}
            </div>

            <div className="pr-4">
              <span
                className="font-mono text-[11px] tracking-[0.2em] transition-colors duration-300"
                style={{
                  color: isComplete
                    ? `${stage.color}99`
                    : isCurrent
                      ? stage.color
                      : "var(--color-text-muted)",
                  opacity: !isComplete && !isCurrent ? 0.25 : 1,
                }}
              >
                {stage.number}
              </span>
              <p
                className={clsx(
                  "text-base mt-1 transition-colors duration-300",
                  !isComplete && !isCurrent && "text-text-muted/30",
                )}
                style={
                  isCurrent
                    ? { color: stage.color, fontWeight: 500 }
                    : isComplete
                      ? { color: "var(--color-text-secondary)" }
                      : undefined
                }
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
