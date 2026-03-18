"use client";

import { BenchmarkStatus } from "@/types";
import StatusBadge from "./StatusBadge";

interface BenchmarkRunnerProps {
  status: BenchmarkStatus | null;
  step: string;
}

const steps: { status: BenchmarkStatus; label: string }[] = [
  { status: "generating", label: "Generate Ideas" },
  { status: "critiquing", label: "Critique & Vote (Round 1)" },
  { status: "revising", label: "Revise Ideas" },
  { status: "voting", label: "Vote (Round 2)" },
  { status: "complete", label: "Complete" },
];

function getStepIndex(status: BenchmarkStatus): number {
  return steps.findIndex((s) => s.status === status);
}

export default function BenchmarkRunner({
  status,
  step,
}: BenchmarkRunnerProps) {
  if (!status) return null;

  const currentIndex = getStepIndex(status);

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold">Benchmark Progress</h3>
        <StatusBadge status={status} />
      </div>

      <p className="text-sm text-gray-600 mb-4">{step}</p>

      {/* Progress steps */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => {
          const isComplete = currentIndex > i;
          const isCurrent = currentIndex === i;

          return (
            <div key={s.status} className="flex-1">
              <div
                className={`h-2 rounded-full transition-colors ${
                  isComplete
                    ? "bg-green-500"
                    : isCurrent
                      ? "bg-blue-500 animate-pulse"
                      : "bg-gray-200"
                }`}
              />
              <p
                className={`text-xs mt-1 ${
                  isComplete || isCurrent
                    ? "text-foreground font-medium"
                    : "text-gray-400"
                }`}
              >
                {s.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
