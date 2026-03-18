"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { BenchmarkRun, BenchmarkStatus } from "@/types";
import BenchmarkForm from "@/components/BenchmarkForm";
import BenchmarkRunner from "@/components/BenchmarkRunner";
import ResultsView from "@/components/ResultsView";

export default function BenchmarkPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<BenchmarkStatus | null>(null);
  const [step, setStep] = useState("");
  const [result, setResult] = useState<BenchmarkRun | null>(null);

  const handleSubmit = useCallback(
    async (categoryId: string, prompt: string) => {
      setIsRunning(true);
      setStatus("generating");
      setStep("Starting benchmark...");
      setResult(null);

      try {
        const response = await fetch("/api/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId, prompt }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const progress = JSON.parse(data);
                setStatus(progress.status);
                setStep(progress.step || "");
                if (progress.run) {
                  setResult(progress.run);
                }
              } catch {
                // ignore parse errors for incomplete chunks
              }
            }
          }
        }
      } catch (error) {
        setStatus("error");
        setStep(
          error instanceof Error ? error.message : "Unknown error occurred"
        );
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-foreground">
            Run Benchmark
          </h1>
        </div>
        <Link
          href="/results"
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          View Past Results
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <BenchmarkForm
              onSubmit={handleSubmit}
              disabled={isRunning}
            />
          </div>
        </div>

        {/* Results area */}
        <div className="lg:col-span-2">
          {status && <BenchmarkRunner status={status} step={step} />}

          {result && status === "complete" && (
            <div className="mt-6">
              <ResultsView run={result} />
            </div>
          )}

          {!status && (
            <div className="flex items-center justify-center h-64 border border-dashed border-gray-300 rounded-lg">
              <p className="text-gray-400 text-center">
                Select a category, enter a prompt, and run a benchmark to see
                results here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
