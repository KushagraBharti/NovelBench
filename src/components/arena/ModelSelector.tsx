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
  const selectedCatalogModels = catalog.filter((model) => selectedModelIds.includes(model.id));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="mb-4 border-b border-border/70 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="label">Models</p>
            <h3 className="font-display text-2xl text-text-primary sm:text-3xl">Choose your contenders</h3>
          </div>
          <div className="text-right">
            <span className="block font-display text-3xl leading-none text-text-primary tabular-nums">
              {totalSelected}
            </span>
            <span className="text-xs uppercase tracking-[0.22em] text-text-muted">
              {MODEL_SELECTION_LIMITS.min} to {MODEL_SELECTION_LIMITS.max}
            </span>
          </div>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-muted">
          Pick the models that will compete in this run. Keep the list tight, then add a custom OpenRouter ID if you need one.
        </p>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        disabled={disabled}
        placeholder="Search models…"
        className={clsx(
          "w-full border-0 border-b border-border/70 bg-transparent px-0 py-3 text-base text-text-primary outline-none transition-colors",
          "placeholder:text-text-muted/45 focus:border-accent"
        )}
      />

      {totalSelected > 0 ? (
        <div className="mt-4 border-b border-border/70 pb-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted">
            Active roster
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {selectedCatalogModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 text-sm text-text-primary"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: model.color }} />
                  <span className="truncate">{model.name}</span>
                </div>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  {model.lab}
                </span>
              </div>
            ))}
            {customModelIds.map((modelId) => (
              <div
                key={modelId}
                className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 text-sm text-text-secondary"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                  <span className="truncate">{modelId}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeCustomModel(modelId)}
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-text-primary"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-y-auto max-h-[360px] min-h-0 lg:max-h-none lg:flex-1">
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
                "group w-full border-b border-border/50 px-1 py-4 text-left transition-colors",
                selected ? "bg-white/[0.03]" : "hover:bg-white/[0.015]",
                (disabled || atLimit) && "cursor-not-allowed opacity-40"
              )}
            >
              <div className="flex items-center gap-4">
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full transition-transform duration-200"
                  style={{
                    backgroundColor: model.color,
                    boxShadow: selected ? `0 0 8px ${model.color}55` : "none",
                    transform: selected ? "scale(1.35)" : "scale(1)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <span className="truncate text-base text-text-primary transition-colors group-hover:text-accent">
                      {model.name}
                    </span>
                    <span className="truncate text-xs uppercase tracking-[0.18em] text-text-muted">
                      {model.lab}
                    </span>
                  </div>
                </div>
                <span
                  className={clsx(
                    "flex-shrink-0 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors",
                    selected ? "text-accent" : "text-text-muted/50",
                  )}
                >
                  {selected ? "In roster" : "Add"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-border/70 pt-4">
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
              "flex-1 border-0 border-b border-border/70 bg-transparent px-0 py-2.5 text-sm text-text-primary outline-none transition-colors",
              "placeholder:text-text-muted/45 focus:border-accent"
            )}
          />
          <button
            type="button"
            onClick={addCustomModel}
            disabled={disabled || !isValidOpenRouterModelId(customModelInput) || totalSelected >= MODEL_SELECTION_LIMITS.max}
            className="border-b border-border/70 px-0 py-2 text-sm uppercase tracking-[0.18em] text-text-secondary transition-colors hover:border-accent hover:text-text-primary disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
