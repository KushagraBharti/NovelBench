"use client";

import { motion } from "framer-motion";
import { CritiqueEntry } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";

interface CritiqueCardProps {
  critique: CritiqueEntry;
  fromModelId: string;
  headingOverride?: string;
}

export default function CritiqueCard({ critique, fromModelId, headingOverride }: CritiqueCardProps) {
  const from = getModelIdentity(fromModelId);
  const to = getModelIdentity(critique.targetModelId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-border pb-5 last:border-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-base text-text-muted">
          <span>{from.name}</span>
          <span className="mx-1 text-text-muted/40">&rarr;</span>
          <span>{to.name}</span>
        </div>
        <span
          className="font-mono text-base font-medium"
          style={{
            color: critique.score >= 7 ? "#6BBF7B" : critique.score >= 5 ? "#C9A84C" : "#C75050",
          }}
        >
          {typeof critique.ranking === "number" ? `#${critique.ranking} · ` : ""}{critique.score}/10
        </span>
      </div>

      {/* Content */}
      <div className="space-y-2.5 text-base text-text-secondary leading-relaxed">
        {critique.strengths && (
          <div>
            <span className="label text-success">{headingOverride ?? "Strengths"}</span>
            <p className="mt-0.5">{critique.strengths}</p>
          </div>
        )}
        {critique.weaknesses && (
          <div>
            <span className="label text-error">Weaknesses</span>
            <p className="mt-0.5">{critique.weaknesses}</p>
          </div>
        )}
        {critique.suggestions && (
          <div>
            <span className="label text-warning">Suggestions</span>
            <p className="mt-0.5">{critique.suggestions}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
