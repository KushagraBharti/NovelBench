"use client";

import { useRef, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { allModelIdentities } from "@/utils/model-identity";

export default function ContendersGrid() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showPersonality, setShowPersonality] = useState<string | null>(null);

  function handleMouseEnter(id: string) {
    setHoveredModel(id);
    hoverTimerRef.current = setTimeout(() => setShowPersonality(id), 2000);
  }

  function handleMouseLeave() {
    setHoveredModel(null);
    clearTimeout(hoverTimerRef.current);
    setShowPersonality(null);
  }

  return (
    <section className="py-28 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <p className="label mb-4">The Competitors</p>
        <h2 className="font-display text-3xl sm:text-4xl text-text-primary mb-16">
          Four contenders
        </h2>

        <div ref={ref} className="space-y-0 border-t border-border">
          {allModelIdentities.map((model, i) => (
            <motion.div
              key={model.id}
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              onMouseEnter={() => handleMouseEnter(model.id)}
              onMouseLeave={handleMouseLeave}
              className="relative border-b border-border py-6 flex items-center justify-between group cursor-default"
            >
              <div className="flex items-center gap-6">
                {/* Monospace initial */}
                <span
                  className="font-mono text-base w-8 text-center transition-colors duration-300"
                  style={{
                    color: hoveredModel === model.id ? model.color : "var(--color-text-muted)",
                  }}
                >
                  {model.initial}
                </span>

                {/* Name */}
                <span className="text-text-primary text-lg font-medium">
                  {model.name}
                </span>
              </div>

              <div className="flex items-center gap-4">
                {/* Provider */}
                <span className="text-base text-text-muted hidden sm:block">
                  {model.provider}
                </span>

                {/* Color dot */}
                <span
                  className="w-2 h-2 rounded-full transition-transform duration-300"
                  style={{
                    backgroundColor: model.color,
                    transform: hoveredModel === model.id ? "scale(1.5)" : "scale(1)",
                  }}
                />
              </div>

              {/* Personality tooltip — 2s hover easter egg */}
              <AnimatePresence>
                {showPersonality === model.id && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute -bottom-1 left-14 translate-y-full z-10 bg-bg-elevated border border-border rounded-lg px-4 py-2 max-w-xs"
                  >
                    <p className="text-base text-text-secondary italic">
                      &ldquo;{model.personality}&rdquo;
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
