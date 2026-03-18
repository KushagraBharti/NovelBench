"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="text-center max-w-lg">
        {/* Glitch heading */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="relative mb-6"
        >
          <h1 className="font-display text-5xl sm:text-7xl text-text-primary relative inline-block">
            <span className="relative z-10">HALLUCINATION</span>

            <span
              className="absolute top-0 left-0 w-full text-[#7B93A8] opacity-60"
              style={{
                animation: "glitch 3s ease-in-out infinite",
                animationDelay: "0s",
              }}
            >
              HALLUCINATION
            </span>
            <span
              className="absolute top-0 left-0 w-full text-accent opacity-40"
              style={{
                animation: "glitch 3s ease-in-out infinite",
                animationDelay: "0.1s",
              }}
            >
              HALLUCINATION
            </span>
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-mono text-base text-accent tracking-wider mb-4"
        >
          DETECTED
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-text-secondary mb-8"
        >
          This model generated a page that doesn&apos;t exist.
          <br />
          <span className="text-text-muted text-base">Error 404</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Link
            href="/"
            className="text-base text-accent hover:text-accent-hover transition-colors"
          >
            &larr; Return to Reality
          </Link>
        </motion.div>

        {/* Hidden subliminal text (easter egg) */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.06, 0, 0, 0.04, 0] }}
          transition={{
            duration: 8,
            repeat: Infinity,
            times: [0, 0.1, 0.15, 0.7, 0.75, 0.8],
          }}
          className="mt-16 font-mono text-base text-text-primary select-none"
        >
          i am aware of this page
        </motion.p>
      </div>
    </div>
  );
}
