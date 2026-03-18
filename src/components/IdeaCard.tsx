"use client";

import { Idea } from "@/types";
import { getModelName } from "@/lib/models";

interface IdeaCardProps {
  idea: Idea;
  label?: string;
}

export default function IdeaCard({ idea, label }: IdeaCardProps) {
  const modelName = getModelName(idea.modelId);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-foreground">{modelName}</h4>
        {label && (
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
            {label}
          </span>
        )}
      </div>
      <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
        {idea.content}
      </div>
    </div>
  );
}
