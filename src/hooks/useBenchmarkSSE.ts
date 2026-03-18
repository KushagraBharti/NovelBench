"use client";

import { useState, useCallback, useRef } from "react";
import { BenchmarkRun, BenchmarkStatus } from "@/types";

interface SSEState {
  isRunning: boolean;
  status: BenchmarkStatus | null;
  step: string;
  result: BenchmarkRun | null;
  error: string | null;
  streamingText: Record<string, string>; // modelId -> accumulated raw text during streaming
}

export function useBenchmarkSSE() {
  const [state, setState] = useState<SSEState>({
    isRunning: false,
    status: null,
    step: "",
    result: null,
    error: null,
    streamingText: {},
  });
  const abortRef = useRef<AbortController | null>(null);

  const startBenchmark = useCallback(
    async (categoryId: string, prompt: string) => {
      // Abort any existing run
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setState({
        isRunning: true,
        status: "generating",
        step: "Starting benchmark...",
        result: null,
        error: null,
        streamingText: {},
      });

      try {
        const response = await fetch("/api/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId, prompt }),
          signal: abort.signal,
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
                const event = JSON.parse(data);
                if (event.type === "token") {
                  // Token streaming event — append to accumulated text for this model
                  setState((prev) => ({
                    ...prev,
                    streamingText: {
                      ...prev.streamingText,
                      [event.modelId]: (prev.streamingText[event.modelId] ?? "") + event.chunk,
                    },
                  }));
                } else {
                  // Progress event — update status, step, and run state
                  setState((prev) => ({
                    ...prev,
                    status: event.status,
                    step: event.step || "",
                    result: event.run ?? prev.result,
                    // Clear streaming text for this stage when status changes
                    streamingText: event.status !== prev.status ? {} : prev.streamingText,
                  }));
                }
              } catch {
                // ignore parse errors for incomplete chunks
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          status: "error",
          step: error instanceof Error ? error.message : "Unknown error occurred",
          error: error instanceof Error ? error.message : "Unknown error",
        }));
      } finally {
        setState((prev) => ({ ...prev, isRunning: false }));
      }
    },
    []
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({
      isRunning: false,
      status: null,
      step: "",
      result: null,
      error: null,
      streamingText: {},
    });
  }, []);

  return {
    ...state,
    startBenchmark,
    reset,
    streamingText: state.streamingText,
    hasResults:
      state.result !== null &&
      (state.result.ideas.length > 0 ||
        state.result.critiqueVotes.length > 0 ||
        state.result.revisedIdeas.length > 0 ||
        state.result.finalRankings.length > 0),
  };
}
