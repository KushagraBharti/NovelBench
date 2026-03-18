"use client";

import { motion } from "framer-motion";
import { Idea } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";
import { getCategoryById } from "@/lib/categories";

interface IdeaComparisonProps {
  original: Idea;
  revised: Idea;
  categoryId: string;
}

export default function IdeaComparison({ original, revised, categoryId }: IdeaComparisonProps) {
  const model = getModelIdentity(original.modelId);
  const category = getCategoryById(categoryId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-border pb-6 last:border-0"
    >
      {/* Model header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: model.color }} />
        <span className="text-base font-medium text-text-primary">{model.name}</span>
      </div>

      {/* Side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Original */}
        <div className="opacity-50">
          <p className="label mb-3">Original</p>
          {original.content.title && (
            <h4 className="font-display text-lg text-text-primary mb-1">{original.content.title}</h4>
          )}
          {original.content.summary && (
            <p className="text-base text-text-secondary italic mb-3">{original.content.summary}</p>
          )}
          {category?.ideaSchema
            .filter((f) => f.key !== "title" && f.key !== "summary")
            .slice(0, 2)
            .map((field) => {
              const value = original.content[field.key];
              if (!value) return null;
              return (
                <div key={field.key} className="mb-2">
                  <span className="label block mb-0.5">{field.label}</span>
                  <p className="text-base text-text-secondary line-clamp-3">{value}</p>
                </div>
              );
            })}
        </div>

        {/* Revised */}
        <div>
          <p className="label mb-3 text-accent">Revised</p>
          {revised.content.title && (
            <h4 className="font-display text-lg text-text-primary mb-1">{revised.content.title}</h4>
          )}
          {revised.content.summary && (
            <p className="text-base text-text-secondary italic mb-3">{revised.content.summary}</p>
          )}
          {category?.ideaSchema
            .filter((f) => f.key !== "title" && f.key !== "summary")
            .slice(0, 2)
            .map((field) => {
              const value = revised.content[field.key];
              if (!value) return null;
              return (
                <div key={field.key} className="mb-2">
                  <span className="label block mb-0.5">{field.label}</span>
                  <p className="text-base text-text-secondary line-clamp-3">{value}</p>
                </div>
              );
            })}
        </div>
      </div>
    </motion.div>
  );
}
