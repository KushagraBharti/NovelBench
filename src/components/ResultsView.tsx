"use client";

import { useState } from "react";
import { BenchmarkRun } from "@/types";
import { getModelName } from "@/lib/models";
import IdeaCard from "./IdeaCard";
import CritiqueCard from "./CritiqueCard";
import RankingTable from "./RankingTable";

interface ResultsViewProps {
  run: BenchmarkRun;
}

type Tab = "ideas" | "critiques" | "rankings" | "revised" | "final";

export default function ResultsView({ run }: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("ideas");

  // Build critique+vote rankings as Ranking[] for the table
  const critiqueRankings = run.critiqueVotes.map((cv) => ({
    judgeModelId: cv.fromModelId,
    rankings: cv.rankings,
  }));

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "ideas", label: "Initial Ideas", count: run.ideas.length },
    { id: "critiques", label: "Critiques", count: run.critiqueVotes.length },
    { id: "rankings", label: "Round 1 Rankings" },
    { id: "revised", label: "Revised Ideas", count: run.revisedIdeas.length },
    { id: "final", label: "Final Rankings" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">
          {run.categoryId}
        </h2>
        <p className="text-gray-600 mt-1">{run.prompt}</p>
        <p className="text-xs text-gray-400 mt-1">
          {new Date(run.timestamp).toLocaleString()}
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 text-xs text-gray-400">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "ideas" && (
          <div className="space-y-4">
            {run.ideas.map((idea) => (
              <IdeaCard key={idea.modelId} idea={idea} label="Initial" categoryId={run.categoryId} />
            ))}
            {run.ideas.length === 0 && (
              <p className="text-gray-500 text-sm">No ideas generated yet.</p>
            )}
          </div>
        )}

        {activeTab === "critiques" && (
          <div className="space-y-6">
            {run.ideas.map((idea) => {
              // Gather all critiques targeting this model
              const critiquesForIdea: { critique: typeof run.critiqueVotes[0]["critiques"][0]; fromModelId: string }[] = [];
              for (const cv of run.critiqueVotes) {
                for (const c of cv.critiques) {
                  if (c.targetModelId === idea.modelId) {
                    critiquesForIdea.push({ critique: c, fromModelId: cv.fromModelId });
                  }
                }
              }
              if (critiquesForIdea.length === 0) return null;
              return (
                <div key={idea.modelId}>
                  <h4 className="text-sm font-semibold text-gray-600 mb-2">
                    Critiques for {getModelName(idea.modelId)}
                  </h4>
                  <div className="space-y-3 ml-4">
                    {critiquesForIdea.map(({ critique, fromModelId }) => (
                      <CritiqueCard
                        key={`${fromModelId}-${critique.targetModelId}`}
                        critique={critique}
                        fromModelId={fromModelId}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {run.critiqueVotes.length === 0 && (
              <p className="text-gray-500 text-sm">No critiques yet.</p>
            )}
          </div>
        )}

        {activeTab === "rankings" && (
          <RankingTable
            rankings={critiqueRankings}
            title="Round 1 Rankings (Initial Ideas)"
          />
        )}

        {activeTab === "revised" && (
          <div className="space-y-4">
            {run.revisedIdeas.map((idea) => (
              <IdeaCard key={idea.modelId} idea={idea} label="Revised" categoryId={run.categoryId} />
            ))}
            {run.revisedIdeas.length === 0 && (
              <p className="text-gray-500 text-sm">No revised ideas yet.</p>
            )}
          </div>
        )}

        {activeTab === "final" && (
          <RankingTable
            rankings={run.finalRankings}
            title="Final Rankings (Revised Ideas)"
          />
        )}
      </div>
    </div>
  );
}
