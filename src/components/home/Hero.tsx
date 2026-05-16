"use client";

import { motion } from "framer-motion";
import { allModelIdentities } from "@/utils/model-identity";
import AuthAwareLink from "@/components/auth/AuthAwareLink";

export default function Hero() {
  return (
    <section className="relative min-h-[85vh] flex items-end pb-24 overflow-hidden">

      <div className="relative z-10 max-w-6xl mx-auto px-6 w-full">
        <div className="max-w-3xl">
          {/* Kicker */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="label mb-6 text-text-secondary [text-shadow:0_1px_6px_rgba(0,0,0,0.8),0_0_20px_rgba(0,0,0,0.5)]"
          >
            LLM Creativity Benchmark
          </motion.p>

          {/* Main heading — serif, large, editorial */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-display text-[clamp(2.8rem,7vw,5.5rem)] leading-[1.05] tracking-tight text-text-primary mb-8 [text-shadow:0_2px_8px_rgba(0,0,0,0.7),0_4px_24px_rgba(0,0,0,0.5),0_0_40px_rgba(9,9,11,0.6)]"
          >
            Where AI creativity
            <br />
            <em className="text-accent [text-shadow:0_2px_8px_rgba(0,0,0,0.8),0_0_30px_rgba(212,99,74,0.3)]">competes.</em>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="text-text-primary/80 text-xl leading-relaxed max-w-lg mb-12 [text-shadow:0_1px_6px_rgba(0,0,0,0.8),0_2px_16px_rgba(0,0,0,0.5)]"
          >
            Frontier models generate ideas, critique each other anonymously,
            revise under pressure, and vote. The best creative mind wins.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="flex items-center gap-6"
          >
            <AuthAwareLink
              href="/arena"
              className="px-7 py-3.5 bg-accent text-white text-base font-medium rounded-lg hover:bg-accent-hover transition-colors shadow-[0_4px_20px_rgba(212,99,74,0.3),0_2px_8px_rgba(0,0,0,0.4)]"
              signedInChildren="Enter the Arena"
              signedOutChildren="Sign in to Compete"
            >
              Enter the Arena
            </AuthAwareLink>
            <AuthAwareLink
              href="/leaderboard"
              className="text-base text-text-secondary hover:text-text-primary transition-colors [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]"
            >
              View rankings &rarr;
            </AuthAwareLink>
          </motion.div>
        </div>

        {/* Model roster — right-aligned, typographic */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="absolute bottom-24 right-6 hidden lg:block"
        >
          <p className="label mb-4 text-right text-text-secondary [text-shadow:0_1px_6px_rgba(0,0,0,0.8),0_0_20px_rgba(0,0,0,0.5)]">The Contenders</p>
          <div className="space-y-2">
            {allModelIdentities.map((model, i) => (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.0 + i * 0.1 }}
                className="flex items-center justify-end gap-3"
              >
                <span className="text-base text-text-primary/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.8),0_2px_12px_rgba(0,0,0,0.5)]">{model.name}</span>
                <span
                  className="w-2 h-2 rounded-full shadow-[0_0_6px_currentColor]"
                  style={{ backgroundColor: model.color }}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-px h-8 bg-text-muted/40 animate-[chevron-bounce_2s_ease-in-out_infinite]" />
      </motion.div>
    </section>
  );
}
