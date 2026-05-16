"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const stages = [
  { number: "01", title: "Generate", desc: "Selected models create ideas from your prompt, working independently and in parallel." },
  { number: "02", title: "Critique", desc: "Each model anonymously reviews and scores the others. No model knows whose work it's judging." },
  { number: "03", title: "Revise", desc: "Armed with feedback, every model refines and strengthens their original idea." },
  { number: "04", title: "Crown", desc: "A final anonymous vote determines which model produced the most creative work." },
];

export default function ProcessTimeline() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-28 px-6 border-t border-border/60 bg-bg-deep/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto">
        <p className="label mb-4">The Process</p>
        <h2 className="font-display text-3xl sm:text-4xl text-text-primary mb-20">
          How it works
        </h2>

        <div ref={ref}>
          {/* Desktop: horizontal row separated by vertical rules */}
          <div className="hidden lg:grid lg:grid-cols-4 border-t border-border">
            {stages.map((stage, i) => (
              <motion.div
                key={stage.number}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className={`pt-8 ${i > 0 ? "border-l border-border pl-8" : ""} ${i < stages.length - 1 ? "pr-8" : ""}`}
              >
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="font-mono text-sm text-accent/60">
                    {stage.number}
                  </span>
                  <h3 className="font-display text-2xl text-text-primary">
                    {stage.title}
                  </h3>
                </div>
                <p className="text-base text-text-secondary leading-relaxed">
                  {stage.desc}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Mobile/tablet: stacked rows with horizontal rules */}
          <div className="lg:hidden">
            {stages.map((stage, i) => (
              <motion.div
                key={stage.number}
                initial={{ opacity: 0, y: 16 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="border-t border-border py-8"
              >
                <div className="flex items-baseline gap-4 mb-3">
                  <span className="font-mono text-sm text-accent/60">
                    {stage.number}
                  </span>
                  <h3 className="font-display text-2xl text-text-primary">
                    {stage.title}
                  </h3>
                </div>
                <p className="text-base text-text-secondary leading-relaxed pl-10">
                  {stage.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
