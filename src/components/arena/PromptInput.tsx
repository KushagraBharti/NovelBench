"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { categories } from "@/lib/categories";
import { clsx } from "clsx";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  categoryId: string;
  disabled?: boolean;
  onQuickRun: (prompt: string) => void;
}

export default function PromptInput({
  value,
  onChange,
  categoryId,
  disabled,
  onQuickRun,
}: PromptInputProps) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [arenaEgg, setArenaEgg] = useState(false);
  const category = categories.find((c) => c.id === categoryId);
  const examples = category?.examplePrompts ?? [];

  // Typewriter placeholder
  useEffect(() => {
    if (examples.length === 0 || value) return;
    const target = examples[placeholderIndex];
    let i = 0;
    setIsTyping(true);

    const typeInt = setInterval(() => {
      if (i <= target.length) {
        setDisplayedPlaceholder(target.slice(0, i));
        i++;
      } else {
        clearInterval(typeInt);
        setIsTyping(false);
        setTimeout(() => setPlaceholderIndex((p) => (p + 1) % examples.length), 3000);
      }
    }, 28);

    return () => clearInterval(typeInt);
  }, [placeholderIndex, examples, value]);

  useEffect(() => {
    setPlaceholderIndex(0);
    setDisplayedPlaceholder("");
  }, [categoryId]);

  useEffect(() => {
    if (value.toLowerCase() === "arena") {
      setArenaEgg(true);
      const t = setTimeout(() => setArenaEgg(false), 1500);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div>
      <p className="label mb-3">Your Prompt</p>

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder={value ? "" : displayedPlaceholder}
          className={clsx(
            "w-full px-4 py-3 bg-bg-surface border border-border rounded-lg text-text-primary text-base",
            "placeholder:text-text-muted/30 resize-y min-h-[100px]",
            "focus:outline-none focus:border-border-active transition-colors duration-200",
            "disabled:opacity-30 disabled:cursor-not-allowed",
            arenaEgg && "border-accent"
          )}
        />

        {/* Cursor */}
        {!value && isTyping && (
          <span
            className="absolute pointer-events-none text-text-muted/30 text-base"
            style={{
              top: 12,
              left: `${16 + displayedPlaceholder.length * 7}px`,
              animation: "typewriter-blink 0.8s step-end infinite",
            }}
          >
            |
          </span>
        )}

        <span className="absolute bottom-2 right-3 font-mono text-base text-text-muted/30">
          {value.length}
        </span>
      </div>

      {/* Quick start examples */}
      {examples.length > 0 && (
        <div className="mt-3">
          <p className="label mb-2">Quick start</p>
          <div className="space-y-1">
            {examples.map((example, i) => (
              <button
                key={i}
                onClick={() => !disabled && onQuickRun(example)}
                disabled={disabled}
                className="w-full text-left text-base px-3 py-2.5 text-text-muted hover:text-text-secondary border-b border-border/50 last:border-0 transition-colors disabled:opacity-30 truncate"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
