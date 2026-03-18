"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { BenchmarkRun } from "@/types";
import ResultsView from "@/components/results/ResultsView";
import { StatusBadge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Skeleton";

export default function BenchmarkDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/results/${id}`);
        if (!response.ok) {
          throw new Error(response.status === 404 ? "Benchmark not found" : "Failed to load");
        }
        setRun(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load benchmark");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back nav */}
      <Link
        href="/archive"
        className="text-base text-text-muted hover:text-text-secondary transition-colors mb-6 inline-block"
      >
        &larr; Archive
      </Link>

      {loading ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center min-h-[40vh] text-center"
        >
          <h2 className="font-display text-2xl text-text-primary mb-2">
            {error}
          </h2>
          <p className="text-base text-text-muted mb-4">
            This benchmark may have been deleted or the ID is incorrect.
          </p>
          <Link
            href="/archive"
            className="text-base text-accent hover:text-accent-hover transition-colors"
          >
            Browse all benchmarks
          </Link>
        </motion.div>
      ) : run ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-6">
            <StatusBadge status={run.status} />
          </div>
          <ResultsView run={run} />
        </motion.div>
      ) : null}
    </div>
  );
}
