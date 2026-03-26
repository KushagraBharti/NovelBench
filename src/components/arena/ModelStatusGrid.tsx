"use client";

import { clsx } from "clsx";
import { BenchmarkRun, BenchmarkStatus } from "@/types";
import { getModelIdentity, getModelOrder } from "@/utils/model-identity";

function getModelStageStatus(
  modelId: string,
  run: BenchmarkRun | null,
  status: BenchmarkStatus
): "waiting" | "thinking" | "done" | "failed" | "paused" | "retrying" | "canceled" {
  if (!run) return "waiting";
  const modelState = run.modelStates[modelId];
  const effectiveStatus =
    ["partial", "error", "dead_lettered", "paused"].includes(status)
      ? ({
          generate: "generating",
          critique: "critiquing",
          human_critique: "awaiting_human_critique",
          revise: "revising",
          vote: "voting",
          complete: "complete",
        }[run.checkpoint.stage] as BenchmarkStatus)
      : status;
  if (modelState?.status === "paused") return "paused";
  if (modelState?.status === "retrying") return "retrying";
  if (modelState?.status === "canceled") return "canceled";
  if (run.failedModels.includes(modelId) || modelState?.status === "failed") return "failed";

  switch (effectiveStatus) {
    case "queued":
      return "waiting";
    case "generating":
      return run.ideas.find((idea) => idea.modelId === modelId) ? "done" : "thinking";
    case "critiquing":
    case "awaiting_human_critique":
      return run.critiqueVotes.find((vote) => vote.fromModelId === modelId)
        ? "done"
        : run.ideas.some((idea) => idea.modelId === modelId)
          ? "thinking"
          : "waiting";
    case "revising":
      return run.revisedIdeas.find((idea) => idea.modelId === modelId)
        ? "done"
        : run.ideas.some((idea) => idea.modelId === modelId)
          ? "thinking"
          : "waiting";
    case "voting":
    case "complete":
    case "partial":
      return run.finalRankings.find((ranking) => ranking.judgeModelId === modelId)
        ? "done"
        : run.revisedIdeas.some((idea) => idea.modelId === modelId)
          ? "thinking"
          : "waiting";
    case "canceled":
    case "dead_lettered":
    case "error":
      return modelState?.status === "complete" ? "done" : "failed";
    default:
      return "waiting";
  }
}

const statusLabels: Record<string, string> = {
  done: "Done",
  paused: "Paused",
  retrying: "Retrying",
  failed: "Failed",
  canceled: "Canceled",
  thinking: "Working",
  waiting: "Waiting",
};

export default function ModelStatusGrid({
  run,
  status,
}: {
  run: BenchmarkRun | null;
  status: BenchmarkStatus;
}) {
  const modelIds = run?.selectedModels.map((model) => model.id) ?? getModelOrder();

  return (
    <div className="border-t border-border">
      {modelIds.map((modelId) => {
        const model = getModelIdentity(modelId);
        const stageStatus = getModelStageStatus(modelId, run, status);
        const modelState = run?.modelStates[modelId];
        const controlState = run?.controls.modelControls[modelId];
        const statusNote =
          stageStatus === "failed"
            ? modelState?.error
            : controlState?.note;

        return (
          <div
            key={modelId}
            className="flex items-center gap-4 py-3 border-b border-border/40"
          >
            {/* Model name */}
            <div className="min-w-0 flex-1">
              <span className="text-base text-text-primary">
                {model.name}
              </span>
              <span className="text-sm text-text-muted ml-2 hidden sm:inline">
                {model.provider}
              </span>
            </div>

            {/* Error/note */}
            {statusNote && (
              <span className="text-xs text-text-muted max-w-[20ch] truncate hidden md:block">
                {statusNote}
              </span>
            )}

            {/* Status */}
            <span
              className={clsx(
                "font-mono text-[11px] uppercase tracking-[0.2em] shrink-0",
                stageStatus === "done" && "text-[#6BBF7B]",
                stageStatus === "thinking" && "text-text-secondary",
                stageStatus === "waiting" && "text-text-muted/40",
                stageStatus === "paused" && "text-[#C9A84C]",
                stageStatus === "retrying" && "text-[#7AA2F7]",
                stageStatus === "failed" && "text-[#C75050]",
                stageStatus === "canceled" && "text-text-muted",
              )}
              style={stageStatus === "thinking" ? { animation: "pulse-dot 1.5s ease-in-out infinite" } : undefined}
            >
              {statusLabels[stageStatus]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
