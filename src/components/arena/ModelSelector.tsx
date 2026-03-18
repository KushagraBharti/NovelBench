"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { getModelCatalog, MODEL_SELECTION_LIMITS, isValidOpenRouterModelId } from "@/lib/models";

interface ModelSelectorProps {
  selectedModelIds: string[];
  customModelIds: string[];
  onChange: (next: { selectedModelIds: string[]; customModelIds: string[] }) => void;
  disabled?: boolean;
}

export default function ModelSelector({
  selectedModelIds,
  customModelIds,
  onChange,
  disabled,
}: ModelSelectorProps) {
  const [query, setQuery] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");
  const catalog = getModelCatalog();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog.filter(
      (model) =>
        model.name.toLowerCase().includes(needle) ||
        model.lab.toLowerCase().includes(needle) ||
        model.tags.some((tag) => tag.includes(needle))
    );
  }, [catalog, query]);

  function toggleModel(modelId: string) {
    const nextIds = selectedModelIds.includes(modelId)
      ? selectedModelIds.filter((id) => id !== modelId)
      : [...selectedModelIds, modelId];
    onChange({ selectedModelIds: nextIds, customModelIds });
  }

  function addCustomModel() {
    const value = customModelInput.trim();
    if (!isValidOpenRouterModelId(value) || customModelIds.includes(value)) return;
    onChange({
      selectedModelIds,
      customModelIds: [...customModelIds, value],
    });
    setCustomModelInput("");
  }

  function removeCustomModel(modelId: string) {
    onChange({
      selectedModelIds,
      customModelIds: customModelIds.filter((id) => id !== modelId),
    });
  }

  const totalSelected = selectedModelIds.length + customModelIds.length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-1">
        <p className="label">Models</p>
        <span className="font-display text-2xl text-text-secondary leading-none tabular-nums">
          {totalSelected}
        </span>
      </div>
      <p className="text-sm text-text-muted mb-4">
        {MODEL_SELECTION_LIMITS.min}–{MODEL_SELECTION_LIMITS.max} competitors · OpenRouter
      </p>

      {/* Search */}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        disabled={disabled}
        placeholder="Search models…"
        className={clsx(
          "w-full px-3 py-2 rounded-lg border border-border bg-bg-deep text-text-primary text-sm",
          "placeholder:text-text-muted/40 focus:outline-none focus:border-border-active transition-colors mb-3"
        )}
      />

      {/* Model list — compact rows */}
      <div className="overflow-y-auto max-h-[360px] lg:max-h-none lg:flex-1 min-h-0">
        {filtered.map((model) => {
          const selected = selectedModelIds.includes(model.id);
          const atLimit = !selected && totalSelected >= MODEL_SELECTION_LIMITS.max;
          return (
            <button
              key={model.id}
              type="button"
              disabled={disabled || atLimit}
              onClick={() => toggleModel(model.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-150 rounded-lg",
                selected ? "bg-bg-elevated/70" : "hover:bg-bg-elevated/30",
                (disabled || atLimit) && "opacity-40 cursor-not-allowed"
              )}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-200"
                style={{
                  backgroundColor: model.color,
                  boxShadow: selected ? `0 0 6px ${model.color}40` : "none",
                  transform: selected ? "scale(1.4)" : "scale(1)",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-text-primary font-medium truncate">
                    {model.name}
                  </span>
                  <span className="text-xs text-text-muted truncate">
                    {model.lab}
                  </span>
                </div>
                <div className="flex gap-2 mt-0.5">
                  {model.tags.map((tag) => (
                    <span key={tag} className="text-[11px] text-text-muted/50 leading-none">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <span
                className={clsx(
                  "text-[11px] font-mono flex-shrink-0 uppercase tracking-widest",
                  selected ? "text-accent/80" : "text-text-muted/25"
                )}
              >
                {selected ? "On" : "Off"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bring Your Own Model */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="label mb-2">Bring Your Own Model</p>
        <div className="flex gap-2">
          <input
            value={customModelInput}
            onChange={(event) => setCustomModelInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomModel();
              }
            }}
            disabled={disabled}
            placeholder="provider/model-name"
            className={clsx(
              "flex-1 px-3 py-1.5 rounded-lg border border-border bg-bg-deep text-text-primary text-sm",
              "placeholder:text-text-muted/40 focus:outline-none focus:border-border-active transition-colors"
            )}
          />
          <button
            type="button"
            onClick={addCustomModel}
            disabled={disabled || !isValidOpenRouterModelId(customModelInput) || totalSelected >= MODEL_SELECTION_LIMITS.max}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
        {customModelIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {customModelIds.map((modelId) => (
              <button
                key={modelId}
                type="button"
                onClick={() => removeCustomModel(modelId)}
                className="px-2.5 py-1 rounded-full border border-border text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                {modelId} ×
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
