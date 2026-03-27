"use client";

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

function getStatusColor(stageStatus: string): string {
  switch (stageStatus) {
    case "done": return "#6BBF7B";
    case "paused": return "#C9A84C";
    case "retrying": return "#7AA2F7";
    case "failed": return "#C75050";
    case "canceled": return "#8A8A8A";
    default: return "";
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
        const statusColor = getStatusColor(stageStatus);
        const isActive = stageStatus === "thinking";

        return (
          <div
            key={modelId}
            className="flex items-center gap-4 py-3 border-b border-border/40 group"
          >
            {/* Left color indicator */}
            <span
              className="w-1 h-5 shrink-0 rounded-full transition-all duration-300"
              style={{
                backgroundColor: isActive
                  ? model.color
                  : statusColor || "var(--color-border)",
                opacity: stageStatus === "waiting" ? 0.2 : 0.8,
                ...(isActive
                  ? { animation: "pulse-dot 1.5s ease-in-out infinite", boxShadow: `0 0 6px ${model.color}40` }
                  : {}),
              }}
            />

            {/* Model name */}
            <div className="min-w-0 flex-1">
              <span
                className="text-base transition-colors"
                style={{ color: isActive ? model.color : "var(--color-text-primary)" }}
              >
                {model.name}
              </span>
              <span className="text-sm text-text-muted/50 ml-2 hidden sm:inline">
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
              className="font-mono text-[11px] uppercase tracking-[0.2em] shrink-0 transition-colors"
              style={{
                color: statusColor || (isActive ? model.color : "var(--color-text-muted)"),
                opacity: stageStatus === "waiting" ? 0.35 : 1,
              }}
            >
              {statusLabels[stageStatus]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
