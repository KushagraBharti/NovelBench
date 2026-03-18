"use client";

import { Idea, Category } from "@/types";
import { getModelName } from "@/lib/models";
import { getCategoryById } from "@/lib/categories";

interface IdeaCardProps {
  idea: Idea;
  label?: string;
  categoryId?: string;
}

export default function IdeaCard({ idea, label, categoryId }: IdeaCardProps) {
  const modelName = getModelName(idea.modelId);
  const category = categoryId ? getCategoryById(categoryId) : undefined;

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
      {idea.content.title && (
        <h5 className="font-medium text-foreground mb-2">{idea.content.title}</h5>
      )}
      {idea.content.summary && (
        <p className="text-sm text-foreground/70 italic mb-3">{idea.content.summary}</p>
      )}
      <div className="space-y-2">
        {category
          ? category.ideaSchema
              .filter((f) => f.key !== "title" && f.key !== "summary")
              .map((field) => {
                const value = idea.content[field.key];
                if (!value) return null;
                return (
                  <div key={field.key}>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {field.label}
                    </span>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                      {value}
                    </p>
                  </div>
                );
              })
          : // Fallback: render all fields
            Object.entries(idea.content)
              .filter(([key]) => key !== "title" && key !== "summary")
              .map(([key, value]) => {
                if (!value) return null;
                return (
                  <div key={key}>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {key}
                    </span>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                      {value}
                    </p>
                  </div>
                );
              })}
      </div>
    </div>
  );
}
