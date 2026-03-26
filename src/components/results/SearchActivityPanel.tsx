"use client";

import { useMemo, useState } from "react";
import { BenchmarkRun } from "@/types";
import { LiveToolActivity } from "@/hooks/useBenchmarkSSE";
import { getModelIdentity } from "@/utils/model-identity";

interface SearchActivityPanelProps {
  run: BenchmarkRun;
  liveToolActivity?: Record<string, LiveToolActivity>;
}

export default function SearchActivityPanel({
  run,
  liveToolActivity = {},
}: SearchActivityPanelProps) {
  const liveEntries = Object.values(liveToolActivity);
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const modelSections = useMemo(() => {
    return run.selectedModels.map((selected) => {
      const usage = run.web.usage
        .filter((entry) => entry.modelId === selected.id)
        .sort((a, b) => a.stage.localeCompare(b.stage));
      const sources = run.web.retrievedSources.filter((entry) => entry.modelId === selected.id);

      const stageSections = usage.map((entry) => ({
        usage: entry,
        sources: sources.filter((source) => source.stage === entry.stage),
      }));

      return {
        modelId: selected.id,
        model: getModelIdentity(selected.id),
        stageSections,
        hasActivity: usage.length > 0 || sources.length > 0,
      };
    });
  }, [run.selectedModels, run.web.retrievedSources, run.web.usage]);

  function toggleModel(modelId: string) {
    setExpandedModels((current) => ({ ...current, [modelId]: !current[modelId] }));
  }

  function toggleStage(key: string) {
    setExpandedStages((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleSource(key: string) {
    setExpandedSources((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="space-y-8">
      {liveEntries.length > 0 && (
        <div className="border-b border-border pb-6">
          <p className="label mb-4">Live Search Activity</p>
          <div className="space-y-3">
            {liveEntries.map((entry) => {
              const model = getModelIdentity(entry.modelId);
              return (
                <div
                  key={`${entry.stage}:${entry.modelId}:${entry.callId}`}
                  className="border-l pl-4"
                  style={{ borderColor: `${model.color}66` }}
                >
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <span>{model.name}</span>
                    <span className="font-mono uppercase">{entry.stage}</span>
                    <span className="ml-auto capitalize">{entry.state}</span>
                  </div>
                  {entry.query && (
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {entry.query}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-0 border-t border-border">
        {modelSections.map(({ modelId, model, stageSections, hasActivity }) => {
          const isModelExpanded = expandedModels[modelId] ?? false;

          return (
            <div key={modelId} className="border-b border-border/60 py-4">
              <button
                type="button"
                onClick={() => toggleModel(modelId)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="text-base text-text-primary">{model.name}</span>
                <span className="ml-auto text-sm text-text-muted">
                  {hasActivity ? `${isModelExpanded ? "Hide" : "Show"} search details` : "No search activity"}
                </span>
              </button>

              {isModelExpanded && hasActivity && (
                <div className="mt-4 space-y-5">
                  {stageSections.map(({ usage, sources }) => {
                    const stageKey = `${modelId}:${usage.stage}`;
                    const isStageExpanded = expandedStages[stageKey] ?? false;

                    return (
                      <div key={stageKey} className="border-l border-border pl-4">
                        <button
                          type="button"
                          onClick={() => toggleStage(stageKey)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span className="font-mono text-sm uppercase text-text-muted">{usage.stage}</span>
                          <span className="ml-auto text-sm text-text-muted">
                            {usage.searchCalls} searches · {usage.sourceCount} sources
                            {usage.totalLatencyMs > 0 ? ` · ${(usage.totalLatencyMs / 1000).toFixed(1)}s` : ""}
                            {` · ${isStageExpanded ? "Hide" : "Show"}`}
                          </span>
                        </button>

                        {isStageExpanded && (
                          <div className="mt-3 space-y-4">
                            {usage.downgradedReason ? (
                              <p className="text-sm text-[#C9A84C] leading-relaxed">
                                Tool calling unavailable for this model. Fell back to plain generation. {usage.downgradedReason}
                              </p>
                            ) : usage.searchQueries.length > 0 ? (
                              <div className="space-y-2">
                                <p className="label">Queries</p>
                                <div className="space-y-2">
                                  {usage.searchQueries.map((query, index) => (
                                    <p key={`${stageKey}:query:${index}`} className="text-sm text-text-secondary leading-relaxed">
                                      {index + 1}. {query}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-text-muted">This stage completed without using search.</p>
                            )}

                            {sources.length > 0 && (
                              <div className="space-y-3">
                                <p className="label">Sources</p>
                                {sources.map((source, index) => {
                                  const sourceKey = `${stageKey}:${source.id}:${index}`;
                                  const isSourceExpanded = expandedSources[sourceKey] ?? false;

                                  return (
                                    <div key={sourceKey} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                                      <button
                                        type="button"
                                        onClick={() => toggleSource(sourceKey)}
                                        className="flex w-full items-start gap-3 text-left"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <a
                                            href={source.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(event) => event.stopPropagation()}
                                            className="block break-all text-sm text-text-primary hover:text-accent transition-colors"
                                          >
                                            {source.url}
                                          </a>
                                          {source.title && source.title !== source.url && (
                                            <p className="mt-1 text-sm text-text-muted">{source.title}</p>
                                          )}
                                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-text-muted/80">
                                            {source.domain || "unknown domain"}
                                          </p>
                                        </div>
                                        <span className="text-sm text-text-muted whitespace-nowrap">
                                          {isSourceExpanded ? "Hide" : "Show"}
                                        </span>
                                      </button>

                                      {isSourceExpanded && (
                                        <div className="mt-3 border-l border-border pl-4">
                                          {source.snippet && (
                                            <p className="text-sm text-text-secondary leading-relaxed">
                                              {source.snippet}
                                            </p>
                                          )}
                                          {source.contentPreview && (
                                            <div className="mt-3 border-t border-border/50 pt-3">
                                              <p className="label mb-2">Content Preview</p>
                                              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-text-muted">
                                                {source.contentPreview}
                                              </pre>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
