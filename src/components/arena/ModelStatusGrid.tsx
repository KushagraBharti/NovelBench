"use client";

import { motion } from "framer-motion";
import { BenchmarkRun, BenchmarkStatus } from "@/types";
import { getModelIdentity, modelOrder } from "@/utils/model-identity";

function getModelStageStatus(
  modelId: string,
  run: BenchmarkRun | null,
  status: BenchmarkStatus
): "waiting" | "thinking" | "done" {
  if (!run) return "waiting";
  switch (status) {
    case "generating":
      return run.ideas.find((i) => i.modelId === modelId) ? "done" : "thinking";
    case "critiquing":
      return run.critiqueVotes.find((cv) => cv.fromModelId === modelId) ? "done" : (run.ideas.length > 0 ? "thinking" : "done");
    case "revising":
      return run.revisedIdeas.find((i) => i.modelId === modelId) ? "done" : (run.critiqueVotes.length > 0 ? "thinking" : "done");
    case "voting":
      return run.finalRankings.find((r) => r.judgeModelId === modelId) ? "done" : (run.revisedIdeas.length > 0 ? "thinking" : "done");
    case "complete":
      return "done";
    default:
      return "waiting";
  }
}

export default function ModelStatusGrid({ run, status }: { run: BenchmarkRun | null; status: BenchmarkStatus }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden">
      {modelOrder.map((modelId) => {
        const model = getModelIdentity(modelId);
        const s = getModelStageStatus(modelId, run, status);

        return (
          <div key={modelId} className="bg-bg-deep p-3 flex items-center gap-3">
            {/* Dot — color indicates status */}
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-300"
              style={{
                backgroundColor: s === "done" ? "#6BBF7B" : s === "thinking" ? model.color : "var(--color-border)",
                ...(s === "thinking" ? { animation: "pulse-dot 1.5s ease-in-out infinite" } : {}),
              }}
            />

            <div className="min-w-0">
              <span className="text-base text-text-primary block truncate">{model.name}</span>
              <span className="text-base text-text-muted">
                {s === "done" ? "Done" : s === "thinking" ? "Working..." : "Waiting"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
