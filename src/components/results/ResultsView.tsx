"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { BenchmarkRun, RunExportEntry } from "@/types";
import { LiveReasoningActivity, LiveToolActivity } from "@/hooks/useBenchmarkSSE";
import { api } from "../../../convex/_generated/api";
import { formatShortDate } from "@/lib/dates";
import { getModelName } from "@/lib/models";
import { getModelIdentity, getModelOrder } from "@/utils/model-identity";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import IdeaCard from "./IdeaCard";
import CritiqueCard from "./CritiqueCard";
import RankingDisplay from "./RankingDisplay";
import IdeaComparison from "./IdeaComparison";
import StreamingCard from "./StreamingCard";
import SearchActivityPanel from "./SearchActivityPanel";

interface ResultsViewProps {
  run: BenchmarkRun;
  isLive?: boolean;
  streamingText?: Record<string, string>;
  toolActivity?: Record<string, LiveToolActivity>;
  reasoningActivity?: Record<string, LiveReasoningActivity>;
}

export default function ResultsView({
  run,
  isLive,
  streamingText = {},
  toolActivity = {},
  reasoningActivity = {},
}: ResultsViewProps) {
  const { isAuthenticated } = useConvexAuth();
  const requestRunExport = useMutation(api.exports.requestRunExport);
  const [showExports, setShowExports] = useState(false);
  const runExports = useQuery(
    api.exports.listByRun,
    isAuthenticated && showExports ? { runId: run.id as never } : "skip"
  );
  const [activeTab, setActiveTab] = useState("ideas");
  const [critiqueFilter, setCritiqueFilter] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const visibleModelOrder = getModelOrder(run.selectedModels.map((model) => model.id));
  const completedRunExports = ((runExports ?? []) as RunExportEntry[]).filter(
    (entry) => entry.status === "complete" && entry.downloadUrl,
  );

  useEffect(() => {
    if (!isLive) return;
    if (run.status === prevStatusRef.current) return;
    prevStatusRef.current = run.status;

    if (run.status === "generating") setActiveTab("ideas");
    else if (run.status === "critiquing" || run.status === "awaiting_human_critique") setActiveTab("critiques");
    else if (run.status === "revising") setActiveTab("revised");
    else if (["voting", "complete", "partial", "canceled"].includes(run.status)) setActiveTab("final");
  }, [isLive, run.status]);

  const critiqueRankings = useMemo(
    () => run.critiqueVotes.map((vote) => ({ judgeModelId: vote.fromModelId, rankings: vote.rankings })),
    [run.critiqueVotes]
  );

  type CritiqueListEntry = {
    critique: BenchmarkRun["critiqueVotes"][number]["critiques"][number];
    fromModelId: string;
    headingOverride?: string;
  };

  const critiquedModels = useMemo(() => {
    const ids = new Set<string>();
    for (const vote of run.critiqueVotes) {
      for (const critique of vote.critiques) ids.add(critique.targetModelId);
    }
    for (const critique of run.humanCritiques) ids.add(critique.targetModelId);
    return Array.from(ids);
  }, [run.critiqueVotes, run.humanCritiques]);
  const hasSearchActivity =
    run.web.toolCalls.length > 0 ||
    run.web.retrievedSources.length > 0 ||
    run.web.usage.length > 0 ||
    Object.keys(toolActivity).length > 0;
  const liveSearchEntries = Object.values(toolActivity);
  const liveReasoningEntries = Object.values(reasoningActivity);
  const failedModelDetails = useMemo(() => {
    const modelIds = new Set<string>(run.failedModels);

    for (const [modelId, state] of Object.entries(run.modelStates)) {
      if (state.status === "failed" || state.status === "skipped" || state.status === "canceled" || state.error) {
        modelIds.add(modelId);
      }
    }

    for (const failure of run.failures) {
      if (failure.modelId) modelIds.add(failure.modelId);
    }

    return Array.from(modelIds).map((modelId) => {
      const state = run.modelStates[modelId];
      const failure = [...run.failures]
        .filter((entry) => entry.modelId === modelId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

      return {
        modelId,
        model: getModelIdentity(modelId),
        stage: failure?.stage ?? state?.stage ?? run.checkpoint.stage,
        status: state?.status ?? "failed",
        message:
          state?.error ??
          failure?.message ??
          run.error ??
          "No explicit failure cause was recorded for this model.",
      };
    });
  }, [run.checkpoint.stage, run.error, run.failedModels, run.failures, run.modelStates]);

  const getStreamingToolEntries = useMemo(() => {
    return (modelId: string, stage: "generate" | "revise") => {
      const merged = new Map<
        string,
        {
          key: string;
          toolName: string;
          state: "started" | "completed" | "failed";
          turn?: number;
          query?: string;
          urls?: string[];
          resultCount?: number;
          error?: string;
        }
      >();

      for (const call of run.web.toolCalls) {
        if (call.modelId !== modelId || call.stage !== stage) continue;
          merged.set(call.id, {
            key: call.id,
            toolName: call.toolName,
            state: call.error ? "failed" : call.completedAt ? "completed" : "started",
            turn: call.turn,
            query: call.args.query,
            urls: call.resultPayload?.results.map((result) => result.url) ?? call.resultSummary?.urls,
            resultCount: call.resultSummary?.resultCount,
            error: call.error,
        });
      }

      for (const entry of liveSearchEntries) {
        if (entry.modelId !== modelId || entry.stage !== stage) continue;
        const existing = merged.get(entry.callId);
        merged.set(entry.callId, {
            key: entry.callId,
            toolName: entry.toolName,
            state: entry.state,
            turn: entry.turn ?? existing?.turn,
            query: entry.query ?? existing?.query,
            urls: entry.urls ?? existing?.urls,
            resultCount: entry.resultCount ?? existing?.resultCount,
            error: entry.error ?? existing?.error,
          });
        }

        return Array.from(merged.values()).sort((a, b) => {
          if ((a.turn ?? 0) !== (b.turn ?? 0)) return (a.turn ?? 0) - (b.turn ?? 0);
          return a.key.localeCompare(b.key);
        });
      };
  }, [liveSearchEntries, run.web.toolCalls]);

  const getStreamingReasoningEntries = useMemo(() => {
    return (modelId: string, stage: "generate" | "revise") => {
      const merged = new Map<
        string,
        {
          key: string;
          turn?: number;
          detailType: "reasoning.summary" | "reasoning.encrypted" | "reasoning.text";
          text?: string;
          summary?: string;
          data?: string;
          format?: string;
          index?: number;
        }
      >();

      for (const detail of run.reasoning.details) {
        if (detail.modelId !== modelId || detail.stage !== stage) continue;
          merged.set(detail.id, {
            key: detail.id,
            turn: detail.turn,
            detailType: detail.type,
            text: detail.text,
            summary: detail.summary,
          data: detail.data,
          format: detail.format,
          index: detail.index,
        });
      }

      for (const detail of liveReasoningEntries) {
        if (detail.modelId !== modelId || detail.stage !== stage) continue;
        const existing = merged.get(detail.detailId);
          merged.set(detail.detailId, {
            key: detail.detailId,
            turn: detail.turn ?? existing?.turn,
            detailType: detail.detailType,
            text: detail.text ?? existing?.text,
            summary: detail.summary ?? existing?.summary,
          data: detail.data ?? existing?.data,
          format: detail.format ?? existing?.format,
          index: detail.index ?? existing?.index,
        });
      }

        return Array.from(merged.values()).sort((a, b) => {
          if ((a.turn ?? 0) !== (b.turn ?? 0)) {
            return (a.turn ?? 0) - (b.turn ?? 0);
          }
          if (a.index !== undefined && b.index !== undefined && a.index !== b.index) {
            return a.index - b.index;
          }
        return a.key.localeCompare(b.key);
      });
    };
  }, [liveReasoningEntries, run.reasoning.details]);

  const tabs: TabItem[] = [
    { id: "ideas", label: "Ideas", count: run.ideas.length, available: run.ideas.length > 0 },
    { id: "critiques", label: "Critiques", count: run.critiqueVotes.length + run.humanCritiques.length, available: run.critiqueVotes.length > 0 || run.humanCritiques.length > 0 },
    { id: "rankings", label: "Round 1", available: run.critiqueVotes.length > 0 },
    { id: "revised", label: "Revisions", count: run.revisedIdeas.length, available: run.revisedIdeas.length > 0 || run.status === "revising" },
    { id: "final", label: "Final", available: run.finalRankings.length > 0 || ["partial", "complete", "canceled"].includes(run.status) },
    ...(!isLive ? [{ id: "search", label: "Search", count: run.web.retrievedSources.length, available: hasSearchActivity }] : []),
  ];

  const failurePanel = failedModelDetails.length > 0 && (
    <div className="border-t border-[#7C3E3E]/45 pt-4">
      <p className="label mb-4 text-[#D8A8A8]">Failure Causes</p>
      <div className="space-y-3">
        {failedModelDetails.map(({ modelId, model, stage, status, message }) => (
          <div key={modelId} className="border-l border-[#7C3E3E]/45 pl-4">
            <div className="flex items-center gap-2.5">
              <span className="text-base text-text-primary">{model.name}</span>
              <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.18em] text-[#D8A8A8]">
                {stage} · {status}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#E7C4C4]">{message}</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-8 border-t border-border pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent capitalize">{run.categoryId}</span>
              {isLive && run.status !== "complete" && run.status !== "partial" && (
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#6BBF7B] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6BBF7B] inline-block" style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }} />
                  Live
                </span>
              )}
              {failedModelDetails.length > 0 && (
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#D8A8A8]">
                  {failedModelDetails.length} issue{failedModelDetails.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="text-text-primary text-base leading-relaxed">{run.prompt}</p>
          </div>
          <span className="font-mono text-[11px] text-text-muted/40 shrink-0 mt-1">
            {formatShortDate(run.timestamp)}
          </span>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === "ideas" && (
          <div className="space-y-6">
            {visibleModelOrder
              .map((modelId) => run.ideas.find((idea) => idea.modelId === modelId))
              .filter((idea): idea is BenchmarkRun["ideas"][number] => Boolean(idea))
              .map((idea) => (
                <IdeaCard key={idea.modelId} idea={idea} label="Initial" categoryId={run.categoryId} />
              ))}

            {isLive && run.status === "generating" &&
              visibleModelOrder
                .filter((modelId) => !run.ideas.some((idea) => idea.modelId === modelId) && !run.failedModels.includes(modelId))
                .map((modelId) => (
                  <StreamingCard
                    key={modelId}
                    modelId={modelId}
                    text={streamingText[modelId] ?? ""}
                    stage="generate"
                    reasoningEntries={getStreamingReasoningEntries(modelId, "generate")}
                    toolEntries={getStreamingToolEntries(modelId, "generate")}
                  />
                ))}

            {failurePanel}
          </div>
        )}

        {activeTab === "critiques" && (
          <div>
            {critiquedModels.length > 0 && (
              <div className="flex gap-4 mb-6 flex-wrap">
                <button
                  onClick={() => setCritiqueFilter(null)}
                  className={`text-base transition-colors ${!critiqueFilter ? "text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                >
                  All
                </button>
                {critiquedModels.map((modelId) => {
                  const model = getModelIdentity(modelId);
                  return (
                    <button
                      key={modelId}
                      onClick={() => setCritiqueFilter(modelId)}
                      className={`text-base transition-colors ${critiqueFilter === modelId ? "text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                    >
                      {model.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-4">
              {run.ideas
                .filter((idea) => !critiqueFilter || idea.modelId === critiqueFilter)
                .map((idea) => {
                  const critiquesForIdea: CritiqueListEntry[] = run.critiqueVotes.flatMap((vote) =>
                    vote.critiques
                      .filter((critique) => critique.targetModelId === idea.modelId)
                      .map((critique) => ({ critique, fromModelId: vote.fromModelId }))
                  );
                  const selfAssessment: CritiqueListEntry[] = run.critiqueVotes
                    .filter((vote) => vote.fromModelId === idea.modelId)
                    .flatMap((vote) => {
                      const explicitSelfCritique = vote.critiques.some((critique) => critique.targetModelId === idea.modelId);
                      if (explicitSelfCritique) return [];
                      const selfRanking = vote.rankings.find((entry) => entry.modelId === idea.modelId);
                      if (!selfRanking?.reasoning) return [];
                      return [{
                        critique: {
                          ideaLabel: "",
                          targetModelId: idea.modelId,
                          strengths: selfRanking.reasoning,
                          weaknesses: "",
                          suggestions: "",
                          score: selfRanking.score,
                          ranking: selfRanking.rank,
                        },
                        fromModelId: vote.fromModelId,
                        headingOverride: "Self Assessment",
                      }];
                    });
                  const humanForIdea: CritiqueListEntry[] = run.humanCritiques
                    .filter((critique) => critique.targetModelId === idea.modelId)
                    .map((critique) => ({ critique, fromModelId: critique.authorLabel }));
                  const allCritiques = [...critiquesForIdea, ...selfAssessment, ...humanForIdea];
                  if (allCritiques.length === 0) return null;

                  return (
                    <div key={idea.modelId}>
                      <p className="label mb-3">
                        Critiques for <span style={{ color: getModelIdentity(idea.modelId).color }}>{getModelName(idea.modelId)}</span>
                      </p>
                      <div className="space-y-0">
                        {allCritiques.map(({ critique, fromModelId, headingOverride }, index) => (
                          <CritiqueCard
                            key={`${fromModelId}-${critique.targetModelId}-${index}-${headingOverride ?? "default"}`}
                            critique={critique}
                            fromModelId={fromModelId}
                            headingOverride={headingOverride}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {activeTab === "rankings" && (
          <RankingDisplay rankings={critiqueRankings} title="Round 1 - Initial Ideas" />
        )}

        {activeTab === "revised" && (
          <div className="space-y-6">
            {visibleModelOrder.map((modelId) => {
              const original = run.ideas.find((idea) => idea.modelId === modelId);
              const revised = run.revisedIdeas.find((idea) => idea.modelId === modelId);
              if (!original && !revised) return null;
              if (!original && revised) {
                return <IdeaCard key={revised.modelId} idea={revised} label="Revised" categoryId={run.categoryId} />;
              }
              if (original && revised) {
                return <IdeaComparison key={revised.modelId} original={original} revised={revised} categoryId={run.categoryId} />;
              }
              return null;
            })}

            {isLive && run.status === "revising" &&
              visibleModelOrder
                .filter((modelId) => !run.revisedIdeas.some((idea) => idea.modelId === modelId) && !run.failedModels.includes(modelId))
                .map((modelId) => (
                  <StreamingCard
                    key={modelId}
                    modelId={modelId}
                    text={streamingText[modelId] ?? ""}
                    stage="revise"
                    reasoningEntries={getStreamingReasoningEntries(modelId, "revise")}
                    toolEntries={getStreamingToolEntries(modelId, "revise")}
                  />
                ))}

            {failurePanel}
          </div>
        )}

        {activeTab === "final" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <RankingDisplay rankings={run.finalRankings} title="Final Rankings - Revised Ideas" showPodium showReasoning />
            {failurePanel}
            {run.status !== "complete" && (
              <div className="border-t border-border pt-4">
                <p className="label mb-2">Run Status</p>
                <p className="text-base text-text-secondary">{run.currentStep}</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "search" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SearchActivityPanel run={run} liveToolActivity={toolActivity} />
          </motion.div>
        )}
      </Tabs>

      {isAuthenticated && (
        <div className="mt-10 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="label">Export</span>
            {!showExports && (
              <button
                type="button"
                onClick={() => setShowExports(true)}
                className="text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                Show downloads
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowExports(true);
                setExportMessage("Queueing JSON export...");
                void requestRunExport({ runId: run.id as never, format: "json" })
                  .then(() => setExportMessage("JSON export queued."))
                  .catch((error) =>
                    setExportMessage(error instanceof Error ? error.message : "Failed to queue export."),
                  );
              }}
              className="text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => {
                setShowExports(true);
                setExportMessage("Queueing CSV export...");
                void requestRunExport({ runId: run.id as never, format: "csv" })
                  .then(() => setExportMessage("CSV export queued."))
                  .catch((error) =>
                    setExportMessage(error instanceof Error ? error.message : "Failed to queue export."),
                  );
              }}
              className="text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              CSV
            </button>
            {completedRunExports.map((entry) => (
              <a
                key={entry.id}
                href={entry.downloadUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                {entry.format.toUpperCase()}
              </a>
            ))}
          </div>
          {exportMessage ? <p className="mt-2 text-sm text-text-muted">{exportMessage}</p> : null}
        </div>
      )}
    </div>
  );
}
