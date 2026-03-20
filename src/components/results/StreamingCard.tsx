"use client";

import { motion } from "framer-motion";
import { getModelIdentity } from "@/utils/model-identity";

interface StreamingCardProps {
  modelId: string;
  text: string;
  stage: "generate" | "revise";
  toolEntries?: Array<{
    key: string;
    toolName: string;
    state: "started" | "completed" | "failed";
    query?: string;
    urls?: string[];
    resultCount?: number;
    error?: string;
  }>;
}

export default function StreamingCard({
  modelId,
  text,
  stage,
  toolEntries = [],
}: StreamingCardProps) {
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

      {toolEntries.length > 0 && (
        <div className="mb-4 space-y-2">
          {toolEntries.map((entry) => {
            const summaryLabel =
              entry.state === "failed"
                ? `${entry.toolName} tool failed`
                : `${entry.toolName} tool called`;

            return (
              <details
                key={entry.key}
                className="group rounded-lg border border-border/70 bg-bg-surface/45"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/80" />
                  <span className="text-text-primary">{summaryLabel}</span>
                  <span className="ml-auto font-mono uppercase tracking-[0.18em] text-[11px] text-text-muted">
                    {entry.state}
                  </span>
                </summary>

                <div className="border-t border-border/60 px-3 py-3 text-sm text-text-secondary">
                  {entry.query && (
                    <p className="leading-relaxed">
                      <span className="label mr-2">Query</span>
                      {entry.query}
                    </p>
                  )}
                  {typeof entry.resultCount === "number" && entry.resultCount > 0 && (
                    <p className="mt-2 text-text-muted">
                      {entry.resultCount} source{entry.resultCount === 1 ? "" : "s"} returned
                    </p>
                  )}
                  {entry.urls && entry.urls.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {entry.urls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-text-secondary transition-colors hover:text-accent"
                        >
                          {url}
                        </a>
                      ))}
                    </div>
                  )}
                  {entry.error && (
                    <p className="mt-2 leading-relaxed text-[#C87A7A]">{entry.error}</p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

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
