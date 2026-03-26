"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Idea } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";
import { getCategoryById } from "@/lib/categories";

interface IdeaComparisonProps {
  original: Idea;
  revised: Idea;
  categoryId: string;
}

function IdeaPanel({
  idea,
  label,
  accentColor,
  allFields,
  expanded,
}: {
  idea: Idea;
  label: string;
  accentColor?: string;
  allFields: { key: string; label: string }[];
  expanded: boolean;
}) {
  const summaryLabel = allFields.find((field) => field.key === "summary")?.label ?? "Summary";
  const fields = allFields.filter((f) => f.key !== "title" && f.key !== "summary");
  const visibleFields = expanded ? fields : fields.slice(0, 2);

  return (
    <div>
      <p className="label mb-3" style={accentColor ? { color: accentColor } : undefined}>{label}</p>
      {idea.content.title && (
        <h4 className="font-display text-lg text-text-primary mb-1">{idea.content.title}</h4>
      )}
      {idea.content.summary && (
        <div className="mb-3">
          <span className="label block mb-0.5">{summaryLabel}</span>
          <p className="text-base text-text-secondary italic">{idea.content.summary}</p>
        </div>
      )}
      <AnimatePresence initial={false}>
        {visibleFields.map((field) => {
          const value = idea.content[field.key];
          if (!value) return null;
          return (
            <motion.div
              key={field.key}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-2 overflow-hidden"
            >
              <span className="label block mb-0.5">{field.label}</span>
              <p className="text-base text-text-secondary whitespace-pre-wrap">{value}</p>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default function IdeaComparison({ original, revised, categoryId }: IdeaComparisonProps) {
  const [expanded, setExpanded] = useState(false);
  const model = getModelIdentity(original.modelId);
  const category = getCategoryById(categoryId);
  const allFields = category?.ideaSchema ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-border pb-6 last:border-0"
    >
      {/* Model header */}
      <div className="mb-4">
        <span className="text-base font-medium text-text-primary">{model.name}</span>
      </div>

      {/* Side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="opacity-50">
          <IdeaPanel idea={original} label="Original" allFields={allFields} expanded={expanded} />
        </div>
        <div>
          <IdeaPanel idea={revised} label="Revised" accentColor="var(--color-accent)" allFields={allFields} expanded={expanded} />
        </div>
      </div>

      {/* Expand toggle — only show when there are hidden fields */}
      {allFields.filter((f) => f.key !== "title" && f.key !== "summary").length > 2 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-base text-text-muted hover:text-text-secondary transition-colors"
        >
          {expanded ? "↑ Show less" : "↓ Show full plan"}
        </button>
      )}
    </motion.div>
  );
}
