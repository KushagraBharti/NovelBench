"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { BenchmarkRun } from "@/types";
import { getModelName } from "@/lib/models";
import { getModelIdentity, modelOrder } from "@/utils/model-identity";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import IdeaCard from "./IdeaCard";
import CritiqueCard from "./CritiqueCard";
import RankingDisplay from "./RankingDisplay";
import IdeaComparison from "./IdeaComparison";
import StreamingCard from "./StreamingCard";

interface ResultsViewProps {
  run: BenchmarkRun;
  isLive?: boolean;
  streamingText?: Record<string, string>;
}

export default function ResultsView({ run, isLive, streamingText = {} }: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState("ideas");
  const [critiqueFilter, setCritiqueFilter] = useState<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  // Auto-switch tabs as benchmark progresses
  useEffect(() => {
    if (!isLive) return;
    if (run.status === prevStatusRef.current) return;
    prevStatusRef.current = run.status;

    if (run.status === "generating") setActiveTab("ideas");
    else if (run.status === "critiquing") setActiveTab("critiques");
    else if (run.status === "revising") setActiveTab("revised");
    else if (run.status === "voting" || run.status === "complete") setActiveTab("final");
  }, [run.status, isLive]);

  const critiqueRankings = useMemo(
    () => run.critiqueVotes.map((cv) => ({ judgeModelId: cv.fromModelId, rankings: cv.rankings })),
    [run.critiqueVotes]
  );

  const critiquedModels = useMemo(() => {
    const ids = new Set<string>();
    for (const cv of run.critiqueVotes) for (const c of cv.critiques) ids.add(c.targetModelId);
    return Array.from(ids);
  }, [run.critiqueVotes]);

  const tabs: TabItem[] = [
    { id: "ideas", label: "Ideas", count: run.ideas.length, available: run.ideas.length > 0 },
    { id: "critiques", label: "Critiques", count: run.critiqueVotes.length, available: run.critiqueVotes.length > 0 },
    { id: "rankings", label: "Round 1", available: run.critiqueVotes.length > 0 },
    { id: "revised", label: "Revisions", count: run.revisedIdeas.length, available: run.revisedIdeas.length > 0 },
    { id: "final", label: "Final", available: run.finalRankings.length > 0 },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="label capitalize">{run.categoryId}</span>
          {isLive && <Badge color="#6BBF7B" pulse>Live</Badge>}
        </div>
        <p className="text-text-primary font-medium text-base">{run.prompt}</p>
        <p className="font-mono text-base text-text-muted mt-1">
          {new Date(run.timestamp).toLocaleString()}
        </p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === "ideas" && (
          <div className="space-y-6">
            {run.ideas.map((idea) => (
              <IdeaCard key={idea.modelId} idea={idea} label="Initial" categoryId={run.categoryId} />
            ))}
            {/* Streaming cards for models still generating */}
            {isLive && run.status === "generating" &&
              modelOrder
                .filter((id) => !run.ideas.some((i) => i.modelId === id))
                .map((modelId) => (
                  <StreamingCard
                    key={modelId}
                    modelId={modelId}
                    text={streamingText[modelId] ?? ""}
                    stage="generate"
                  />
                ))}
            {!isLive && run.ideas.length === 0 && (
              <p className="text-text-muted text-base">No ideas recorded.</p>
            )}
          </div>
        )}

        {activeTab === "critiques" && (
          <div>
            {critiquedModels.length > 0 && (
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setCritiqueFilter(null)}
                  className={`text-base transition-colors ${!critiqueFilter ? "text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                >
                  All
                </button>
                {critiquedModels.map((modelId) => {
                  const m = getModelIdentity(modelId);
                  return (
                    <button
                      key={modelId}
                      onClick={() => setCritiqueFilter(modelId)}
                      className="flex items-center gap-1.5 text-base transition-colors"
                      style={{ color: critiqueFilter === modelId ? m.color : "var(--color-text-muted)" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                      {m.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-4">
              {run.ideas
                .filter((idea) => !critiqueFilter || idea.modelId === critiqueFilter)
                .map((idea) => {
                  const critiquesForIdea: { critique: (typeof run.critiqueVotes)[0]["critiques"][0]; fromModelId: string }[] = [];
                  for (const cv of run.critiqueVotes) {
                    for (const c of cv.critiques) {
                      if (c.targetModelId === idea.modelId) critiquesForIdea.push({ critique: c, fromModelId: cv.fromModelId });
                    }
                  }
                  if (critiquesForIdea.length === 0) return null;
                  return (
                    <div key={idea.modelId}>
                      <p className="label mb-3">
                        Critiques for <span style={{ color: getModelIdentity(idea.modelId).color }}>{getModelName(idea.modelId)}</span>
                      </p>
                      <div className="space-y-0">
                        {critiquesForIdea.map(({ critique, fromModelId }) => (
                          <CritiqueCard key={`${fromModelId}-${critique.targetModelId}`} critique={critique} fromModelId={fromModelId} />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {activeTab === "rankings" && (
          <RankingDisplay rankings={critiqueRankings} title="Round 1 — Initial Ideas" />
        )}

        {activeTab === "revised" && (
          <div className="space-y-6">
            {run.revisedIdeas.map((revised) => {
              const original = run.ideas.find((i) => i.modelId === revised.modelId);
              if (!original) return <IdeaCard key={revised.modelId} idea={revised} label="Revised" categoryId={run.categoryId} />;
              return <IdeaComparison key={revised.modelId} original={original} revised={revised} categoryId={run.categoryId} />;
            })}
            {/* Streaming cards for models still revising */}
            {isLive && run.status === "revising" &&
              run.ideas
                .filter((idea) => !run.revisedIdeas.some((r) => r.modelId === idea.modelId))
                .map((idea) => (
                  <StreamingCard
                    key={idea.modelId}
                    modelId={idea.modelId}
                    text={streamingText[idea.modelId] ?? ""}
                    stage="revise"
                  />
                ))}
            {run.revisedIdeas.length === 0 && !isLive && (
              <p className="text-text-muted text-base">No revisions recorded.</p>
            )}
            {run.revisedIdeas.length === 0 && isLive && run.status !== "revising" && (
              <p className="text-text-muted text-base">Waiting for revisions...</p>
            )}
          </div>
        )}

        {activeTab === "final" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <RankingDisplay rankings={run.finalRankings} title="Final Rankings — Revised Ideas" showPodium />
          </motion.div>
        )}
      </Tabs>
    </div>
  );
}
