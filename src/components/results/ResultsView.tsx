"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { BenchmarkRun } from "@/types";
import { getModelName } from "@/lib/models";
import { getModelIdentity } from "@/utils/model-identity";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import IdeaCard from "./IdeaCard";
import CritiqueCard from "./CritiqueCard";
import RankingDisplay from "./RankingDisplay";
import IdeaComparison from "./IdeaComparison";

interface ResultsViewProps {
  run: BenchmarkRun;
  isLive?: boolean;
}

export default function ResultsView({ run, isLive }: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState("ideas");
  const [critiqueFilter, setCritiqueFilter] = useState<string | null>(null);

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
            {run.ideas.length === 0 && <p className="text-text-muted text-base">Waiting for ideas...</p>}
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
            {run.revisedIdeas.length > 0 && run.ideas.length > 0
              ? run.revisedIdeas.map((revised) => {
                  const original = run.ideas.find((i) => i.modelId === revised.modelId);
                  if (!original) return <IdeaCard key={revised.modelId} idea={revised} label="Revised" categoryId={run.categoryId} />;
                  return <IdeaComparison key={revised.modelId} original={original} revised={revised} categoryId={run.categoryId} />;
                })
              : <p className="text-text-muted text-base">Waiting for revisions...</p>}
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
