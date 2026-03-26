"use client";

import { categories } from "@/lib/categories";
import { clsx } from "clsx";

interface CategorySelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export default function CategorySelector({
  selectedId,
  onSelect,
  disabled,
}: CategorySelectorProps) {
  return (
    <div>
      <p className="label mb-4">Domain</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-t border-l border-border">
        {categories.map((cat) => {
          const selected = cat.id === selectedId;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => !disabled && onSelect(cat.id)}
              disabled={disabled}
              className={clsx(
                "text-left px-4 py-3.5 border-r border-b border-border transition-all duration-200",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                selected
                  ? "bg-accent/[0.06] border-b-accent/40"
                  : "hover:bg-white/[0.03]",
              )}
            >
              <span
                className={clsx(
                  "text-base block font-medium transition-colors",
                  selected ? "text-accent" : "text-text-secondary hover:text-text-primary",
                )}
              >
                {cat.name}
              </span>
              <span
                className={clsx(
                  "text-xs leading-snug mt-1 block line-clamp-2 transition-colors",
                  selected ? "text-text-secondary" : "text-text-muted",
                )}
              >
                {cat.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
