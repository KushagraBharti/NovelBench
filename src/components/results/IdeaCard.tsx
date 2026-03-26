"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Idea } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";
import { getCategoryById } from "@/lib/categories";

interface IdeaCardProps {
  idea: Idea;
  label?: "Initial" | "Revised";
  categoryId?: string;
}

export default function IdeaCard({ idea, label, categoryId }: IdeaCardProps) {
  const [expanded, setExpanded] = useState(false);
  const model = getModelIdentity(idea.modelId);
  const category = categoryId ? getCategoryById(categoryId) : undefined;
  const summaryLabel = category?.ideaSchema.find((field) => field.key === "summary")?.label ?? "Summary";

  const fields = category
    ? category.ideaSchema
        .filter((f) => f.key !== "title" && f.key !== "summary")
        .map((f) => ({ key: f.key, label: f.label, value: idea.content[f.key] || "" }))
        .filter((f) => f.value)
    : Object.entries(idea.content)
        .filter(([key]) => key !== "title" && key !== "summary")
        .map(([key, value]) => ({ key, label: key, value: value || "" }))
        .filter((f) => f.value);

  const visibleFields = expanded ? fields : fields.slice(0, 2);
  const hasMore = fields.length > 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-border pb-6 last:border-0"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-base font-medium text-text-primary">{model.name}</span>
        {label && (
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
            {label}
          </span>
        )}
      </div>

      {/* Title */}
      {idea.content.title && (
        <h4 className="font-display text-xl text-text-primary mb-1">
          {idea.content.title}
        </h4>
      )}

      {/* Summary */}
      {idea.content.summary && (
        <div className="mb-4">
          <span className="label block mb-0.5">{summaryLabel}</span>
          <p className="text-base text-text-secondary italic leading-relaxed">
            {idea.content.summary}
          </p>
        </div>
      )}

      {/* Fields */}
      <div className="space-y-3">
        {visibleFields.map((field) => (
          <div key={field.key}>
            <span className="label block mb-0.5">{field.label}</span>
            <p className="text-base text-text-secondary leading-relaxed whitespace-pre-wrap">
              {field.value}
            </p>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-base text-text-muted hover:text-text-secondary transition-colors"
        >
          {expanded ? "Show less" : `+ ${fields.length - 2} more fields`}
        </button>
      )}
    </motion.div>
  );
}
