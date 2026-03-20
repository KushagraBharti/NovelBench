"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BenchmarkRun } from "@/types";
import { LiveToolActivity } from "@/hooks/useBenchmarkSSE";
import { getModelName } from "@/lib/models";
import { getModelIdentity, getModelOrder } from "@/utils/model-identity";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
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
}

export default function ResultsView({ run, isLive, streamingText = {}, toolActivity = {} }: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState("ideas");
  const [critiqueFilter, setCritiqueFilter] = useState<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const visibleModelOrder = getModelOrder(run.selectedModels.map((model) => model.id));

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
  const hasSearchActivity = run.web.toolCalls.length > 0 || Object.keys(toolActivity).length > 0;
  const liveSearchEntries = Object.values(toolActivity);

  const getStreamingToolEntries = useMemo(() => {
    return (modelId: string, stage: "generate" | "revise") => {
      const merged = new Map<
        string,
        {
          key: string;
          toolName: string;
          state: "started" | "completed" | "failed";
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
          query: call.args.query,
          urls: call.resultSummary?.urls,
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
          query: entry.query ?? existing?.query,
          urls: entry.urls ?? existing?.urls,
          resultCount: entry.resultCount ?? existing?.resultCount,
          error: entry.error ?? existing?.error,
        });
      }

      return Array.from(merged.values()).sort((a, b) => a.key.localeCompare(b.key));
    };
  }, [liveSearchEntries, run.web.toolCalls]);

  const tabs: TabItem[] = [
    { id: "ideas", label: "Ideas", count: run.ideas.length, available: run.ideas.length > 0 },
    { id: "critiques", label: "Critiques", count: run.critiqueVotes.length + run.humanCritiques.length, available: run.critiqueVotes.length > 0 || run.humanCritiques.length > 0 },
    { id: "rankings", label: "Round 1", available: run.critiqueVotes.length > 0 },
    { id: "revised", label: "Revisions", count: run.revisedIdeas.length, available: run.revisedIdeas.length > 0 || run.status === "revising" },
    { id: "final", label: "Final", available: run.finalRankings.length > 0 || ["partial", "complete", "canceled"].includes(run.status) },
    ...(!isLive ? [{ id: "search", label: "Search", count: run.web.retrievedSources.length, available: hasSearchActivity }] : []),
  ];

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="label capitalize">{run.categoryId}</span>
          {isLive && run.status !== "complete" && run.status !== "partial" && <Badge color="#6BBF7B" pulse>Live</Badge>}
          {run.failedModels.length > 0 && <Badge color="#C75050">{run.failedModels.length} failed</Badge>}
        </div>
        <p className="text-text-primary font-medium text-base">{run.prompt}</p>
        <p className="font-mono text-base text-text-muted mt-1">
          {new Date(run.timestamp).toLocaleString()}
        </p>
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
                    toolEntries={getStreamingToolEntries(modelId, "generate")}
                  />
                ))}

            {run.failedModels.length > 0 && (
              <div className="border border-border rounded-xl p-4 bg-bg-surface/60">
                <p className="label mb-2">Unavailable Models</p>
                <p className="text-base text-text-muted">
                  {run.failedModels.map((modelId) => getModelIdentity(modelId).name).join(", ")}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "critiques" && (
          <div>
            {critiquedModels.length > 0 && (
              <div className="flex gap-3 mb-6 flex-wrap">
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
                      className="flex items-center gap-1.5 text-base transition-colors"
                      style={{ color: critiqueFilter === modelId ? model.color : "var(--color-text-muted)" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: model.color }} />
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
                    toolEntries={getStreamingToolEntries(modelId, "revise")}
                  />
                ))}
          </div>
        )}

        {activeTab === "final" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <RankingDisplay rankings={run.finalRankings} title="Final Rankings - Revised Ideas" showPodium showReasoning />
            {run.status !== "complete" && (
              <div className="border border-border rounded-xl p-4 bg-bg-surface/60">
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
    </div>
  );
}
