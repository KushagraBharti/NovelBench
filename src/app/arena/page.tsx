"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { categories } from "@/lib/categories";
import { useBenchmarkSSE } from "@/hooks/useBenchmarkSSE";
import CategorySelector from "@/components/arena/CategorySelector";
import PromptInput from "@/components/arena/PromptInput";
import ArenaRunner from "@/components/arena/ArenaRunner";
import WinnerReveal from "@/components/arena/WinnerReveal";
import ResultsView from "@/components/results/ResultsView";
import Button from "@/components/ui/Button";

export default function ArenaPage() {
  return (
    <Suspense>
      <ArenaContent />
    </Suspense>
  );
}

function ArenaContent() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || categories[0].id;

  const [categoryId, setCategoryId] = useState(initialCategory);
  const [prompt, setPrompt] = useState("");
  const [showWinner, setShowWinner] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  const { isRunning, status, step, result, hasResults, startBenchmark } =
    useBenchmarkSSE();

  useEffect(() => {
    if (prevStatusRef.current !== "complete" && status === "complete" && result) {
      setShowWinner(true);
    }
    prevStatusRef.current = status;
  }, [status, result]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (prompt.trim() && !isRunning) startBenchmark(categoryId, prompt.trim());
    },
    [prompt, isRunning, categoryId, startBenchmark]
  );

  const handleQuickRun = useCallback(
    (examplePrompt: string) => {
      if (isRunning) return;
      setPrompt(examplePrompt);
      startBenchmark(categoryId, examplePrompt);
    },
    [isRunning, categoryId, startBenchmark]
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-12">
        {/* Left panel */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <AnimatePresence mode="wait">
            {!isRunning ? (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <form onSubmit={handleSubmit} className="space-y-6">
                  <CategorySelector
                    selectedId={categoryId}
                    onSelect={setCategoryId}
                    disabled={isRunning}
                  />
                  <PromptInput
                    value={prompt}
                    onChange={setPrompt}
                    categoryId={categoryId}
                    disabled={isRunning}
                    onQuickRun={handleQuickRun}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isRunning || !prompt.trim()}
                    className="w-full"
                  >
                    Enter the Arena
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="summary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-l-2 border-border pl-4"
              >
                <p className="label mb-2">Running</p>
                <p className="text-base text-text-primary capitalize mb-1">{categoryId}</p>
                <p className="text-base text-text-muted line-clamp-3">{prompt}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right panel */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {status ? (
              <motion.div
                key="arena"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {isRunning && <ArenaRunner status={status} step={step} run={result} />}
                {hasResults && result && <ResultsView run={result} isLive={isRunning} />}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col justify-center min-h-[60vh]"
              >
                <p className="font-display text-6xl sm:text-8xl text-border leading-none mb-4">
                  4
                </p>
                <p className="text-text-muted text-base max-w-xs">
                  Four models are ready. Select a domain and enter your creative prompt to begin.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {result && status === "complete" && (
        <WinnerReveal run={result} show={showWinner} onDismiss={() => setShowWinner(false)} />
      )}
    </div>
  );
}
