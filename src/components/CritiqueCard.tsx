"use client";

import { CritiqueEntry } from "@/types";
import { getModelName } from "@/lib/models";

interface CritiqueCardProps {
  critique: CritiqueEntry;
  fromModelId: string;
}

export default function CritiqueCard({ critique, fromModelId }: CritiqueCardProps) {
  const fromName = getModelName(fromModelId);
  const toName = getModelName(critique.targetModelId);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">
          {fromName} &rarr; {toName}
        </span>
        <span className="text-sm font-bold text-blue-600">
          {critique.score}/10
        </span>
      </div>
      <div className="space-y-2 text-sm text-foreground/80">
        {critique.strengths && (
          <div>
            <span className="font-semibold text-green-700">Strengths: </span>
            <span>{critique.strengths}</span>
          </div>
        )}
        {critique.weaknesses && (
          <div>
            <span className="font-semibold text-red-700">Weaknesses: </span>
            <span>{critique.weaknesses}</span>
          </div>
        )}
        {critique.suggestions && (
          <div>
            <span className="font-semibold text-amber-700">Suggestions: </span>
            <span>{critique.suggestions}</span>
          </div>
        )}
      </div>
    </div>
  );
}
