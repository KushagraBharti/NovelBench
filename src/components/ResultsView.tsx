"use client";

import { useState } from "react";
import { BenchmarkRun } from "@/types";
import { getCategoryById } from "@/lib/categories";
import IdeaCard from "./IdeaCard";
import CritiqueCard from "./CritiqueCard";
import RankingTable from "./RankingTable";

interface ResultsViewProps {
  run: BenchmarkRun;
}

type Tab = "ideas" | "critiques" | "round1" | "revised" | "round2";

export default function ResultsView({ run }: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("ideas");
  const category = getCategoryById(run.categoryId);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "ideas", label: "Initial Ideas", count: run.ideas.length },
    { id: "critiques", label: "Critiques", count: run.critiques.length },
    { id: "round1", label: "Round 1 Rankings" },
    {
      id: "revised",
      label: "Revised Ideas",
      count: run.revisedIdeas.length,
    },
    { id: "round2", label: "Round 2 Rankings" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">
          {category?.name ?? run.categoryId}
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
              <IdeaCard key={idea.modelId} idea={idea} label="Initial" />
            ))}
            {run.ideas.length === 0 && (
              <p className="text-gray-500 text-sm">No ideas generated yet.</p>
            )}
          </div>
        )}

        {activeTab === "critiques" && (
          <div className="space-y-4">
            {run.ideas.map((idea) => {
              const critiquesForIdea = run.critiques.filter(
                (c) => c.toModelId === idea.modelId
              );
              if (critiquesForIdea.length === 0) return null;
              return (
                <div key={idea.modelId}>
                  <h4 className="text-sm font-semibold text-gray-600 mb-2">
                    Critiques for{" "}
                    {idea.modelId}
                  </h4>
                  <div className="space-y-3 ml-4">
                    {critiquesForIdea.map((critique) => (
                      <CritiqueCard
                        key={`${critique.fromModelId}-${critique.toModelId}`}
                        critique={critique}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {run.critiques.length === 0 && (
              <p className="text-gray-500 text-sm">No critiques yet.</p>
            )}
          </div>
        )}

        {activeTab === "round1" && (
          <RankingTable
            rankings={run.round1Rankings}
            title="Round 1 Rankings (Initial Ideas)"
          />
        )}

        {activeTab === "revised" && (
          <div className="space-y-4">
            {run.revisedIdeas.map((idea) => (
              <IdeaCard key={idea.modelId} idea={idea} label="Revised" />
            ))}
            {run.revisedIdeas.length === 0 && (
              <p className="text-gray-500 text-sm">
                No revised ideas yet.
              </p>
            )}
          </div>
        )}

        {activeTab === "round2" && (
          <RankingTable
            rankings={run.round2Rankings}
            title="Round 2 Rankings (Revised Ideas)"
          />
        )}
      </div>
    </div>
  );
}
