"use client";

import { motion } from "framer-motion";

export default function RouteLoading({
  title = "Loading",
  subtitle = "Preparing the next surface.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[28vh] max-w-6xl items-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full border-t border-border pt-10"
      >
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="label mb-3">{title}</p>
            <p className="text-sm leading-relaxed text-text-secondary">{subtitle}</p>
          </div>
          <motion.span
            animate={{ opacity: [0.24, 1, 0.24] }}
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.1, ease: "easeInOut" }}
            className="h-2 w-2 flex-shrink-0 rounded-full bg-accent"
          />
        </div>
      </motion.div>
    </div>
  );
}
