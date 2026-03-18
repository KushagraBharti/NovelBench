"use client";

import { motion } from "framer-motion";
import { categories } from "@/lib/categories";
import { getCategoryIdentity } from "@/utils/category-identity";
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
      <p className="label mb-3">Domain</p>
      <div className="grid grid-cols-2 gap-0 border border-border rounded-lg overflow-hidden">
        {categories.map((cat) => {
          const identity = getCategoryIdentity(cat.id);
          const isSelected = cat.id === selectedId;

          return (
            <button
              key={cat.id}
              onClick={() => !disabled && onSelect(cat.id)}
              disabled={disabled}
              className={clsx(
                "relative px-4 py-3 text-left text-base transition-colors duration-150 border-b border-r border-border",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                isSelected
                  ? "bg-bg-elevated text-text-primary"
                  : "bg-transparent text-text-muted hover:text-text-secondary hover:bg-bg-surface"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-1 h-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isSelected ? identity.color : "transparent" }}
                />
                <span className="font-medium truncate">{cat.name}</span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedId && (
        <motion.p
          key={selectedId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-base text-text-muted mt-3 leading-relaxed"
        >
          {categories.find((c) => c.id === selectedId)?.description}
        </motion.p>
      )}
    </div>
  );
}
