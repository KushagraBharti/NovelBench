"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BenchmarkRun } from "@/types";
import ResultsView from "@/components/ResultsView";
import StatusBadge from "@/components/StatusBadge";

export default function BenchmarkDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/results/${id}`);
        if (!response.ok) {
          throw new Error("Benchmark run not found");
        }
        const data = await response.json();
        setRun(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen p-8 max-w-5xl mx-auto">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen p-8 max-w-5xl mx-auto">
        <Link
          href="/results"
          className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
        >
          &larr; Back to Results
        </Link>
        <p className="text-red-500">{error || "Not found"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/results"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Results
        </Link>
        <StatusBadge status={run.status} />
      </div>
      <ResultsView run={run} />
    </div>
  );
}
