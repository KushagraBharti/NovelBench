"use client";

import { useState } from "react";
import { BenchmarkRun } from "@/types";
import Button from "@/components/ui/Button";
import { getModelIdentity } from "@/utils/model-identity";

interface HumanCritiquePanelProps {
  run: BenchmarkRun;
  disabled?: boolean;
  onSubmit: (payload: {
    targetModelId: string;
    ideaLabel: string;
    strengths: string;
    weaknesses: string;
    suggestions: string;
    score: number;
    authorLabel: string;
  }[]) => Promise<void>;
  onProceed: () => Promise<void>;
}

export default function HumanCritiquePanel({
  run,
  disabled,
  onSubmit,
  onProceed,
}: HumanCritiquePanelProps) {
  const [drafts, setDrafts] = useState<Record<string, { strengths: string; weaknesses: string; suggestions: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingOnly, setSavingOnly] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const critiques = Object.entries(drafts)
    .filter(([, draft]) => draft.strengths || draft.weaknesses || draft.suggestions)
    .map(([targetModelId, draft]) => ({
      targetModelId,
      ideaLabel: "H",
      strengths: draft.strengths,
      weaknesses: draft.weaknesses,
      suggestions: draft.suggestions,
      score: 7,
      authorLabel: "You",
    }));

  async function handleSubmit() {
    setSubmitting(true);
    try {
      if (critiques.length > 0) {
        await onSubmit(critiques);
        setSavedCount(critiques.length);
      }
      await onProceed();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveOnly() {
    if (critiques.length === 0) {
      setSavedCount(0);
      return;
    }

    setSavingOnly(true);
    try {
      await onSubmit(critiques);
      setSavedCount(critiques.length);
    } finally {
      setSavingOnly(false);
    }
  }

  return (
    <div className="border-t border-border pt-6">
      <div className="flex flex-col gap-5 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label mb-2">Optional Human Critique</p>
          <p className="max-w-2xl text-base leading-relaxed text-text-secondary">
            This is the only intentional manual checkpoint in the run. Save critique guidance for any model you want, then continue to revision when you are ready.
          </p>
          <p className="mt-3 text-sm uppercase tracking-[0.18em] text-text-muted">
            Leave everything blank to skip human critique entirely.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleSaveOnly}
            disabled={disabled || submitting || savingOnly || critiques.length === 0}
            className="border-b border-border/70 py-1 text-sm uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-accent hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingOnly ? "Saving..." : "Save critique"}
          </button>
          <Button onClick={handleSubmit} disabled={disabled || submitting || savingOnly}>
            {submitting ? "Continuing..." : critiques.length > 0 ? "Continue to Revision" : "Skip to Revision"}
          </Button>
        </div>
      </div>

      {savedCount > 0 ? (
        <p className="mt-4 text-sm uppercase tracking-[0.18em] text-accent">
          Saved {savedCount} human critique{savedCount === 1 ? "" : "s"}.
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        {run.ideas
          .filter((idea) => !run.failedModels.includes(idea.modelId))
          .map((idea) => {
            const identity = getModelIdentity(idea.modelId);
            const draft = drafts[idea.modelId] ?? { strengths: "", weaknesses: "", suggestions: "" };

            return (
              <div key={idea.modelId} className="border-b border-border/70 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: identity.color }} />
                  <span className="text-text-primary font-medium">{identity.name}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(["strengths", "weaknesses", "suggestions"] as const).map((field) => (
                    <textarea
                      key={field}
                      value={draft[field]}
                      disabled={disabled || submitting || savingOnly}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [idea.modelId]: {
                            ...draft,
                            [field]: event.target.value,
                          },
                        }))
                      }
                      rows={4}
                      placeholder={field[0].toUpperCase() + field.slice(1)}
                      className="w-full border border-border/70 bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
