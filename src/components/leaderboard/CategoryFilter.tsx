"use client";

import { getCategoryIdentity } from "@/utils/category-identity";

interface CategoryFilterProps {
  categories: string[];
  selected: string;
  onSelect: (id: string) => void;
  totalRuns: number;
  getCategoryRuns: (catId: string) => number;
}

export default function CategoryFilter({
  categories: categoryIds,
  selected,
  onSelect,
  totalRuns,
  getCategoryRuns,
}: CategoryFilterProps) {
  return (
    <div className="flex gap-4 flex-wrap border-b border-border pb-3">
      <button
        onClick={() => onSelect("all")}
        className={`text-base transition-colors ${
          selected === "all"
            ? "text-text-primary"
            : "text-text-muted hover:text-text-secondary"
        }`}
      >
        All
        <span className="font-mono ml-1.5 text-text-muted">{totalRuns}</span>
      </button>

      {categoryIds.map((catId) => {
        const identity = getCategoryIdentity(catId);
        const isSelected = selected === catId;
        const runs = getCategoryRuns(catId);

        return (
          <button
            key={catId}
            onClick={() => onSelect(catId)}
            className="flex items-center gap-1.5 text-base transition-colors capitalize"
            style={{
              color: isSelected ? identity.color : "var(--color-text-muted)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: identity.color }}
            />
            {catId}
            <span className="font-mono opacity-50">{runs}</span>
          </button>
        );
      })}
    </div>
  );
}
