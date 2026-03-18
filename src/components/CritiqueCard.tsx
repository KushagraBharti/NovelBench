"use client";

import { Critique } from "@/types";
import { getModelName } from "@/lib/models";

interface CritiqueCardProps {
  critique: Critique;
}

export default function CritiqueCard({ critique }: CritiqueCardProps) {
  const fromName = getModelName(critique.fromModelId);
  const toName = getModelName(critique.toModelId);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">
          {fromName} &rarr; {toName}
        </span>
        <span className="text-sm font-bold text-blue-600">
          {critique.score}/10
        </span>
      </div>
      <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
        {critique.content}
      </div>
    </div>
  );
}
