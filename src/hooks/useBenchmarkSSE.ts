"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { BenchmarkRun, BenchmarkStatus } from "@/types";
import { api } from "../../convex/_generated/api";

export interface LiveToolActivity {
  modelId: string;
  stage: "generate" | "revise";
  toolName: "search_web";
  state: "started" | "completed" | "failed";
  callId: string;
  turn?: number;
  query?: string;
  resultCount?: number;
  urls?: string[];
  error?: string;
}

export interface LiveReasoningActivity {
  modelId: string;
  stage: "generate" | "revise";
  detailId: string;
  turn?: number;
  detailType: "reasoning.summary" | "reasoning.encrypted" | "reasoning.text";
  format?: string;
  index?: number;
  text?: string;
  summary?: string;
  data?: string;
}

interface SSEState {
  runId: string | null;
  isRunning: boolean;
  status: BenchmarkStatus | null;
  step: string;
  liveCursorCreatedAt: number;
  liveCursorEventId: string | null;
  result: BenchmarkRun | null;
  error: string | null;
  streamingText: Record<string, string>;
  toolActivity: Record<string, LiveToolActivity>;
  reasoningActivity: Record<string, LiveReasoningActivity>;
}

interface StartBenchmarkPayload {
  categoryId: string;
  prompt: string;
  selectedModelIds: string[];
  customModelIds: string[];
}

function isStreamingStatus(status: BenchmarkStatus | null) {
  return status === "generating" || status === "revising";
}

function isRunningStatus(status: BenchmarkStatus | null) {
  return (
    status === "queued" ||
    status === "generating" ||
    status === "critiquing" ||
    status === "revising" ||
    status === "voting"
  );
}

function isTerminalSnapshotStatus(status: BenchmarkStatus | null) {
  return (
    status === "complete" ||
    status === "partial" ||
    status === "canceled" ||
    status === "dead_lettered" ||
    status === "error"
  );
}

export function useBenchmarkSSE() {
  const [state, setState] = useState<SSEState>({
    runId: null,
    isRunning: false,
    status: null,
    step: "",
    liveCursorCreatedAt: 0,
    liveCursorEventId: null,
    result: null,
    error: null,
    streamingText: {},
    toolActivity: {},
    reasoningActivity: {},
  });
  const seenLiveEventIdsRef = useRef<Set<string>>(new Set());
  const terminalRefreshRef = useRef<string | null>(null);
  const liveRun = useQuery(
    api.runs.getMetadata,
    state.runId
      ? {
          runId: state.runId as never,
        }
      : "skip"
  );
  const shouldSubscribeToLiveActivity = Boolean(state.runId && isStreamingStatus(state.status));
  const liveEvents = useQuery(
    api.runs.liveActivitySince,
    shouldSubscribeToLiveActivity && state.runId
      ? {
          runId: state.runId as never,
          sinceCreatedAt: state.liveCursorCreatedAt,
          sinceEventId: state.liveCursorEventId ?? undefined,
        }
      : "skip"
  );

  useEffect(() => {
    if (liveRun === undefined || !liveRun) return;

    setState((prev) => {
      const statusChanged = prev.status !== liveRun.status;
      const isStreamingStage = isStreamingStatus(liveRun.status);
      const preservedResult =
        prev.result && prev.result.id === liveRun.id
          ? {
              ...prev.result,
              ...liveRun,
              humanCritiques: prev.result.humanCritiques,
              failures: prev.result.failures,
              cancellation: prev.result.cancellation,
              controls: prev.result.controls,
              circuitBreaker: prev.result.circuitBreaker,
              web: prev.result.web,
              reasoning: prev.result.reasoning,
            }
          : liveRun;

      return {
        ...prev,
        runId: liveRun.id,
        isRunning: isRunningStatus(liveRun.status),
        status: liveRun.status,
        step: liveRun.currentStep,
        result: preservedResult,
        error: liveRun.status === "error" ? liveRun.error ?? liveRun.currentStep : null,
        streamingText: statusChanged ? {} : prev.streamingText,
        toolActivity: statusChanged && !isStreamingStage ? {} : prev.toolActivity,
        reasoningActivity: statusChanged && !isStreamingStage ? {} : prev.reasoningActivity,
      };
    });
  }, [liveRun]);

  useEffect(() => {
    if (!state.runId || !isTerminalSnapshotStatus(state.status)) {
      terminalRefreshRef.current = null;
      return;
    }
    const refreshKey = `${state.runId}:${state.status}`;
    if (terminalRefreshRef.current === refreshKey) {
      return;
    }
    terminalRefreshRef.current = refreshKey;

    void fetch(`/api/results/${state.runId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as BenchmarkRun;
      })
      .then((run) => {
        setState((prev) => ({
          ...prev,
          result: run,
          status: run.status,
          step: run.currentStep,
          error: run.status === "error" ? run.error ?? run.currentStep : null,
          isRunning: isRunningStatus(run.status),
        }));
      })
      .catch(() => {
        terminalRefreshRef.current = null;
      });
  }, [state.runId, state.status]);

  useEffect(() => {
    if (!liveEvents) return;
    const freshEvents = (liveEvents as Array<{
      id: string;
      kind: string;
      stage: "generate" | "revise";
      participantModelId?: string;
      createdAt: number;
      payload?:
        | {
            chunk?: string;
            state?: "started" | "completed" | "failed";
            toolName?: "search_web";
            callId?: string;
            turn?: number;
            query?: string;
            resultCount?: number;
            urls?: string[];
            error?: string;
            detailId?: string;
            detailType?: "reasoning.summary" | "reasoning.encrypted" | "reasoning.text";
            format?: string;
            index?: number;
            text?: string;
            summary?: string;
            data?: string;
            batch?: boolean;
            details?: Array<{
              detailId?: string;
              detailType: "reasoning.summary" | "reasoning.encrypted" | "reasoning.text";
              format?: string;
              index?: number;
              text?: string;
              summary?: string;
              data?: string;
            }>;
          }
        | null;
    }>).filter((event) => {
      if (seenLiveEventIdsRef.current.has(event.id)) {
        return false;
      }
      seenLiveEventIdsRef.current.add(event.id);
      return true;
    });

    if (freshEvents.length === 0) {
      return;
    }

    setState((prev) => {
      const nextStreamingText = { ...prev.streamingText };
      const nextToolActivity = { ...prev.toolActivity };
      const nextReasoningActivity = { ...prev.reasoningActivity };
      let nextCursorCreatedAt = prev.liveCursorCreatedAt;
      let nextCursorEventId = prev.liveCursorEventId;

      for (const event of freshEvents) {
        if (
          event.createdAt > nextCursorCreatedAt ||
          (event.createdAt === nextCursorCreatedAt &&
            (nextCursorEventId === null || event.id.localeCompare(nextCursorEventId) > 0))
        ) {
          nextCursorCreatedAt = event.createdAt;
          nextCursorEventId = event.id;
        }
        if (!event.participantModelId) continue;

        if (event.kind === "live_token") {
          nextStreamingText[event.participantModelId] =
            (nextStreamingText[event.participantModelId] ?? "") + String(event.payload?.chunk ?? "");
          continue;
        }

        if (
          event.kind === "tool_call_activity" &&
          event.payload?.callId &&
          event.payload.toolName &&
          event.payload.state
        ) {
          const key = `${event.stage}:${event.participantModelId}:${event.payload.callId}`;
          nextToolActivity[key] = {
            modelId: event.participantModelId,
            stage: event.stage,
            toolName: event.payload.toolName,
            state: event.payload.state,
            callId: event.payload.callId,
            turn: event.payload.turn,
            query: event.payload.query,
            resultCount: event.payload.resultCount,
            urls: event.payload.urls,
            error: event.payload.error,
          };
          continue;
        }

        if (event.kind !== "reasoning_detail") {
          continue;
        }

        const detailPayloads =
          event.payload?.batch && Array.isArray(event.payload.details)
            ? event.payload.details.map((detail) => ({
                ...detail,
                turn: event.payload?.turn,
              }))
            : event.payload?.detailId && event.payload?.detailType
              ? [event.payload]
              : [];

        for (const detail of detailPayloads) {
          if (!detail.detailId || !detail.detailType) continue;
          const key = `${event.stage}:${event.participantModelId}:${detail.detailId}`;
          const existing = nextReasoningActivity[key];
          nextReasoningActivity[key] = {
            modelId: event.participantModelId,
            stage: event.stage,
            detailId: detail.detailId,
            turn: detail.turn ?? existing?.turn,
            detailType: detail.detailType,
            format: detail.format ?? existing?.format,
            index: detail.index ?? existing?.index,
            text: `${existing?.text ?? ""}${detail.text ?? ""}` || undefined,
            summary: `${existing?.summary ?? ""}${detail.summary ?? ""}` || undefined,
            data: `${existing?.data ?? ""}${detail.data ?? ""}` || undefined,
          };
        }
      }

      return {
        ...prev,
        liveCursorCreatedAt: nextCursorCreatedAt,
        liveCursorEventId: nextCursorEventId,
        streamingText: nextStreamingText,
        toolActivity: nextToolActivity,
        reasoningActivity: nextReasoningActivity,
      };
    });
  }, [liveEvents]);

  const connectToRun = useCallback((runId: string) => {
    seenLiveEventIdsRef.current.clear();
    terminalRefreshRef.current = null;
    setState((prev) => ({
      ...prev,
      runId,
      liveCursorCreatedAt: 0,
      liveCursorEventId: null,
      error: null,
      streamingText: {},
      toolActivity: {},
      reasoningActivity: {},
    }));
  }, []);

  const startBenchmark = useCallback(
    async ({ categoryId, prompt, selectedModelIds, customModelIds }: StartBenchmarkPayload) => {
      seenLiveEventIdsRef.current.clear();
      terminalRefreshRef.current = null;
      setState({
        runId: null,
        isRunning: true,
        status: "queued",
        step: "Queueing benchmark...",
        liveCursorCreatedAt: 0,
        liveCursorEventId: null,
        result: null,
        error: null,
        streamingText: {},
        toolActivity: {},
        reasoningActivity: {},
      });

      try {
        const response = await fetch("/api/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId,
            prompt,
            selectedModelIds,
            customModelIds,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        }

        const payload = await response.json();
        setState((prev) => ({
          ...prev,
          runId: payload.id,
          result: payload,
          status: payload.status ?? prev.status,
          step: payload.currentStep ?? prev.step,
          error: null,
        }));
        return payload.id as string;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start benchmark";
        setState((prev) => ({
          ...prev,
          isRunning: false,
          status: null,
          step: "",
          error: message,
        }));
        return null;
      }
    },
    []
  );

  const attachToRun = useCallback(
    (run: BenchmarkRun) => {
      seenLiveEventIdsRef.current.clear();
      terminalRefreshRef.current = null;
      setState((prev) => ({
        ...prev,
        runId: run.id,
        liveCursorCreatedAt: 0,
        liveCursorEventId: null,
        result: run,
        status: run.status,
        step: run.currentStep,
        error: run.status === "error" ? run.error ?? run.currentStep : null,
        isRunning: isRunningStatus(run.status),
        streamingText: {},
        toolActivity: {},
        reasoningActivity: {},
      }));
    },
    []
  );

  const performAction = useCallback(
    async (path: string, body?: unknown) => {
      if (!state.runId) return null;
      try {
        const response = await fetch(`/api/benchmark/${state.runId}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        }
        const payload = await response.json();
        const nextRunId = payload?.id ?? state.runId;
        setState((prev) => ({
          ...prev,
          result: payload ?? prev.result,
          runId: nextRunId,
          status: payload?.status ?? prev.status,
          step: payload?.currentStep ?? prev.step,
          error: null,
          isRunning: payload?.status
            ? isRunningStatus(payload.status)
            : prev.isRunning,
        }));
        return payload;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Run action failed";
        setState((prev) => ({
          ...prev,
          error: message,
        }));
        return null;
      }
    },
    [state.runId]
  );

  const reset = useCallback(() => {
    seenLiveEventIdsRef.current.clear();
    terminalRefreshRef.current = null;
    setState({
      runId: null,
      isRunning: false,
      status: null,
      step: "",
      liveCursorCreatedAt: 0,
      liveCursorEventId: null,
      result: null,
      error: null,
      streamingText: {},
      toolActivity: {},
      reasoningActivity: {},
    });
  }, []);

  return useMemo(
    () => ({
      ...state,
      startBenchmark,
      attachToRun,
      connectToRun,
      reset,
      pauseBenchmark: () => performAction("pause"),
      cancelBenchmark: () => performAction("cancel"),
      proceedBenchmark: () => performAction("proceed"),
      resumeBenchmark: () => performAction("resume"),
      restartBenchmark: () => performAction("restart"),
      submitHumanCritiques: (critiques: unknown[]) => performAction("human-critiques", { critiques }),
      hasResults:
        state.result !== null &&
        (state.result.ideas.length > 0 ||
          state.result.critiqueVotes.length > 0 ||
          state.result.revisedIdeas.length > 0 ||
          state.result.finalRankings.length > 0 ||
          state.result.web.toolCalls.length > 0 ||
          state.result.reasoning.details.length > 0 ||
          Object.keys(state.toolActivity).length > 0 ||
          Object.keys(state.reasoningActivity).length > 0),
    }),
    [attachToRun, connectToRun, performAction, reset, startBenchmark, state]
  );
}
