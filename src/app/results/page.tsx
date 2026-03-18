"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { BenchmarkStatus } from "@/types";

interface RunSummary {
  id: string;
  categoryId: string;
  prompt: string;
  timestamp: string;
  status: BenchmarkStatus;
  modelCount: number;
}

export default function ResultsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/results");
        if (response.ok) {
          setRuns(await response.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-foreground">
            Past Benchmarks
          </h1>
        </div>
        <Link
          href="/benchmark"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          New Benchmark
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-400 mb-4">No benchmark runs yet.</p>
          <Link
            href="/benchmark"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            Run your first benchmark
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/benchmark/${run.id}`}
              className="block border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {run.prompt}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {run.categoryId} &middot; {run.modelCount} models &middot;{" "}
                    {new Date(run.timestamp).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
