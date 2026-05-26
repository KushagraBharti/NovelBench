"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import {
  getArchivedModelCatalog,
  getModelCatalog,
  MODEL_SELECTION_LIMITS,
  isValidOpenRouterModelId,
} from "@/lib/models";
import type { ModelCatalogEntry } from "@/types";

interface ModelSelectorProps {
  selectedModelIds: string[];
  customModelIds: string[];
  onChange: (next: { selectedModelIds: string[]; customModelIds: string[] }) => void;
  disabled?: boolean;
}

function modelMatchesQuery(model: ModelCatalogEntry, needle: string) {
  return (
    model.name.toLowerCase().includes(needle) ||
    model.lab.toLowerCase().includes(needle) ||
    model.tags.some((tag) => tag.includes(needle))
  );
}

export default function ModelSelector({
  selectedModelIds,
  customModelIds,
  onChange,
  disabled,
}: ModelSelectorProps) {
  const [query, setQuery] = useState("");
  const [showArchivedModels, setShowArchivedModels] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const activeCatalog = useMemo(() => getModelCatalog(), []);
  const archivedCatalog = useMemo(() => getArchivedModelCatalog(), []);
  const fullCatalog = useMemo(
    () => [...activeCatalog, ...archivedCatalog],
    [activeCatalog, archivedCatalog],
  );
  const totalSelected = selectedModelIds.length + customModelIds.length;
  const selectedCatalogModels = fullCatalog.filter((model) => selectedModelIds.includes(model.id));
  const needle = query.trim().toLowerCase();

  const filteredActive = useMemo(() => {
    if (!needle) return activeCatalog;
    return activeCatalog.filter((model) => modelMatchesQuery(model, needle));
  }, [activeCatalog, needle]);

  const filteredArchived = useMemo(() => {
    if (!needle) return archivedCatalog;
    return archivedCatalog.filter((model) => modelMatchesQuery(model, needle));
  }, [archivedCatalog, needle]);

  const shouldShowArchivedModels = showArchivedModels || needle.length > 0;

  useEffect(() => {
    if (archivedCatalog.some((model) => selectedModelIds.includes(model.id))) {
      setShowArchivedModels(true);
    }
  }, [archivedCatalog, selectedModelIds]);

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

  function renderModelRow(model: ModelCatalogEntry) {
    const selected = selectedModelIds.includes(model.id);
    const atLimit = !selected && totalSelected >= MODEL_SELECTION_LIMITS.max;

    return (
      <button
        key={model.id}
        type="button"
        disabled={disabled || atLimit}
        onClick={() => toggleModel(model.id)}
        className={clsx(
          "group w-full flex items-baseline gap-4 py-3 border-b border-border/30 text-left transition-colors",
          selected ? "bg-white/[0.02]" : "hover:bg-white/[0.01]",
          !model.active && "text-text-secondary",
          (disabled || atLimit) && "cursor-not-allowed opacity-30"
        )}
      >
        <span className="text-base text-text-primary group-hover:text-accent transition-colors truncate flex-1">
          {model.name}
        </span>
        <span className="label text-[11px] hidden sm:block">
          {model.lab}
          {!model.active ? " / older" : ""}
        </span>
        <span
          className={clsx(
            "text-[11px] uppercase tracking-[0.22em] shrink-0 transition-colors",
            selected ? "text-accent" : "text-text-muted/40",
          )}
        >
          {selected ? "Selected" : "Add"}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="label mb-1">Models</p>
            <h3 className="font-display text-2xl text-text-primary">Choose your contenders</h3>
          </div>
          <div className="text-right">
            <span className="font-mono text-2xl text-text-primary tabular-nums">
              {totalSelected}
            </span>
            <span className="text-[11px] uppercase tracking-[0.22em] text-text-muted ml-1">
              / {MODEL_SELECTION_LIMITS.max}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        disabled={disabled}
        placeholder="Search models…"
        className={clsx(
          "w-full border-0 border-b border-border bg-transparent px-0 py-3 text-base text-text-primary outline-none transition-colors",
          "placeholder:text-text-muted/45 focus:border-accent"
        )}
      />

      {/* Active roster summary */}
      {totalSelected > 0 && (
        <div className="mt-4 pb-4 border-b border-border">
          <p className="label mb-3">Active Roster</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {selectedCatalogModels.map((model) => (
              <span key={model.id} className="text-sm text-text-secondary">
                {model.name}
              </span>
            ))}
            {customModelIds.map((modelId) => (
              <button
                key={modelId}
                type="button"
                onClick={() => removeCustomModel(modelId)}
                className="text-sm text-text-muted hover:text-accent transition-colors"
              >
                {modelId} ×
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Model list */}
      <div className="mt-2 overflow-y-auto max-h-[360px] min-h-0 lg:max-h-none lg:flex-1">
        {filteredActive.map((model) => renderModelRow(model))}

        {archivedCatalog.length > 0 && !needle && (
          <button
            type="button"
            onClick={() => setShowArchivedModels((current) => !current)}
            disabled={disabled}
            className={clsx(
              "group w-full flex items-center justify-between gap-4 py-3 border-b border-border/50 text-left transition-colors",
              "hover:bg-white/[0.01] disabled:cursor-not-allowed disabled:opacity-30"
            )}
          >
            <span>
              <span className="label text-[11px]">Older Models</span>
              <span className="ml-3 text-sm text-text-muted">
                {showArchivedModels
                  ? "Hide previous roster"
                  : `${archivedCatalog.length} previous contenders`}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={clsx(
                "h-4 w-4 text-text-muted transition-transform group-hover:text-text-secondary",
                shouldShowArchivedModels && "rotate-180"
              )}
            />
          </button>
        )}

        {shouldShowArchivedModels && filteredArchived.length > 0 && (
          <div>
            <div className="flex items-center justify-between py-3 border-b border-border/40">
              <p className="label text-[11px]">
                {needle ? "Older Matches" : "Older Roster"}
              </p>
              <span className="font-mono text-[11px] text-text-muted/60 tabular-nums">
                {filteredArchived.length}
              </span>
            </div>
            {filteredArchived.map((model) => renderModelRow(model))}
          </div>
        )}

        {filteredActive.length === 0 &&
          (!shouldShowArchivedModels || filteredArchived.length === 0) && (
            <p className="py-6 text-sm text-text-muted">
              No models match that search.
            </p>
          )}
      </div>

      {/* Custom model */}
      <div className="mt-4 border-t border-border pt-4">
        <p className="label mb-2">Bring Your Own Model</p>
        <div className="flex gap-3">
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
              "flex-1 border-0 border-b border-border bg-transparent px-0 py-2.5 text-sm text-text-primary outline-none transition-colors",
              "placeholder:text-text-muted/45 focus:border-accent"
            )}
          />
          <button
            type="button"
            onClick={addCustomModel}
            disabled={disabled || !isValidOpenRouterModelId(customModelInput) || totalSelected >= MODEL_SELECTION_LIMITS.max}
            className="border-b border-border px-0 py-2 text-sm uppercase tracking-[0.18em] text-text-secondary transition-colors hover:border-accent hover:text-text-primary disabled:opacity-30"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
