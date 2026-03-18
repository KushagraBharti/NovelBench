"use client";

import { motion } from "framer-motion";
import { getModelIdentity } from "@/utils/model-identity";

interface StreamingCardProps {
  modelId: string;
  text: string;
  stage: "generate" | "revise";
}

export default function StreamingCard({ modelId, text, stage }: StreamingCardProps) {
  const model = getModelIdentity(modelId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-border rounded-lg p-5 bg-bg-surface/30"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: model.color,
            animation: "pulse-dot 1.5s ease-in-out infinite",
          }}
        />
        <span className="text-base font-medium text-text-primary">{model.name}</span>
        <span className="label ml-auto">
          {stage === "generate" ? "generating" : "revising"}
        </span>
      </div>

      {/* Content */}
      {text ? (
        <div className="relative max-h-52 overflow-hidden">
          <pre className="text-base text-text-secondary font-mono whitespace-pre-wrap break-words leading-relaxed">
            {text}
            <span
              className="inline-block w-0.5 h-[1em] bg-accent align-middle ml-px"
              style={{ animation: "pulse-dot 1s ease-in-out infinite" }}
            />
          </pre>
          {/* Fade at bottom to indicate there may be more */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-bg-deep to-transparent pointer-events-none" />
        </div>
      ) : (
        /* Thinking dots */
        <div className="flex gap-1.5 items-center h-8">
          {[0, 0.2, 0.4].map((delay, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-text-muted/40"
              style={{ animation: `pulse-dot 1.2s ease-in-out ${delay}s infinite` }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
