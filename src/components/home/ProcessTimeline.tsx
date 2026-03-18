"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const stages = [
  { number: "01", title: "Generate", desc: "All four models create ideas from your prompt, working independently and in parallel." },
  { number: "02", title: "Critique", desc: "Each model anonymously reviews and scores the others. No model knows whose work it's judging." },
  { number: "03", title: "Revise", desc: "Armed with feedback, every model refines and strengthens their original idea." },
  { number: "04", title: "Crown", desc: "A final anonymous vote determines which model produced the most creative work." },
];

export default function ProcessTimeline() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-28 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <p className="label mb-4">The Process</p>
        <h2 className="font-display text-3xl sm:text-4xl text-text-primary mb-16">
          How it works
        </h2>

        <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
          {stages.map((stage, i) => (
            <motion.div
              key={stage.number}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-bg-deep p-8"
            >
              <span className="font-mono text-base text-text-muted block mb-6">
                {stage.number}
              </span>
              <h3 className="font-display text-2xl text-text-primary mb-3">
                {stage.title}
              </h3>
              <p className="text-base text-text-secondary leading-relaxed">
                {stage.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
