"use client";

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

  return (
    <div className="space-y-6">
      {liveEntries.length > 0 && (
        <div className="border border-border rounded-xl bg-bg-surface/40 p-4">
          <p className="label mb-3">Live Search Activity</p>
          <div className="space-y-3">
            {liveEntries.map((entry) => {
              const model = getModelIdentity(entry.modelId);
              return (
                <div
                  key={`${entry.stage}:${entry.modelId}:${entry.callId}`}
                  className="flex flex-col gap-1 border-l pl-4"
                  style={{ borderColor: `${model.color}66` }}
                >
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: model.color }} />
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

      <div className="space-y-5">
        {run.selectedModels.map((selected) => {
          const usage = run.web.usage
            .filter((entry) => entry.modelId === selected.id)
            .sort((a, b) => a.stage.localeCompare(b.stage));
          const sources = run.web.retrievedSources.filter((entry) => entry.modelId === selected.id);
          const model = getModelIdentity(selected.id);

          return (
            <div key={selected.id} className="border-b border-border/60 pb-5 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: model.color }} />
                <span className="text-base text-text-primary">{model.name}</span>
              </div>

              {usage.length === 0 && sources.length === 0 ? (
                <p className="text-sm text-text-muted">No search activity recorded for this model.</p>
              ) : (
                <div className="space-y-4">
                  {usage.map((entry) => (
                    <div key={`${entry.modelId}:${entry.stage}`} className="border-l border-border pl-4">
                      <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className="font-mono uppercase">{entry.stage}</span>
                        <span className="ml-auto font-mono">
                          {entry.searchCalls} searches · {entry.sourceCount} sources · {(entry.totalLatencyMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                      {entry.downgradedReason ? (
                        <p className="mt-2 text-sm text-[#C9A84C] leading-relaxed">
                          Tool calling unavailable for this model. Fell back to plain generation. {entry.downgradedReason}
                        </p>
                      ) : entry.searchQueries.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.searchQueries.map((query, index) => (
                            <span key={`${entry.stage}-${index}`} className="text-xs px-2 py-1 rounded-full border border-border text-text-secondary bg-bg-surface/50">
                              {query}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-text-muted">This stage completed without using search.</p>
                      )}
                    </div>
                  ))}

                  {sources.length > 0 && (
                    <div className="grid grid-cols-1 gap-3">
                      {sources.map((source) => (
                        <div key={source.id} className="rounded-xl border border-border bg-bg-surface/30 p-4">
                          <div className="flex items-center gap-2 text-sm text-text-muted">
                            <span className="font-mono uppercase">{source.stage}</span>
                            <span className="truncate">{source.domain || source.url}</span>
                          </div>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-base text-text-primary hover:text-accent transition-colors"
                          >
                            {source.title || source.url}
                          </a>
                          {source.snippet && (
                            <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                              {source.snippet}
                            </p>
                          )}
                          {source.contentPreview && (
                            <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-text-muted border-t border-border/50 pt-3">
                              {source.contentPreview}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
