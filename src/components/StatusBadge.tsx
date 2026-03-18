"use client";

import { BenchmarkStatus } from "@/types";

const statusConfig: Record<
  BenchmarkStatus,
  { label: string; color: string }
> = {
  generating: { label: "Generating", color: "bg-blue-100 text-blue-800" },
  critiquing: { label: "Critiquing", color: "bg-yellow-100 text-yellow-800" },
  revising: { label: "Revising", color: "bg-purple-100 text-purple-800" },
  voting: { label: "Voting", color: "bg-orange-100 text-orange-800" },
  complete: { label: "Complete", color: "bg-green-100 text-green-800" },
  error: { label: "Error", color: "bg-red-100 text-red-800" },
};

export default function StatusBadge({ status }: { status: BenchmarkStatus }) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
    >
      {status !== "complete" && status !== "error" && (
        <span className="mr-1 animate-pulse">&#9679;</span>
      )}
      {config.label}
    </span>
  );
}
