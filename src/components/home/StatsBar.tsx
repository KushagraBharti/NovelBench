"use client";

import { useEffect, useState } from "react";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

interface Stats {
  totalRuns: number;
  totalIdeas: number;
  totalCritiques: number;
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats>({ totalRuns: 0, totalIdeas: 0, totalCritiques: 0 });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/results");
        if (res.ok) {
          const runs = await res.json();
          setStats({
            totalRuns: runs.length,
            totalIdeas: runs.length * 4,
            totalCritiques: runs.length * 12,
          });
        }
      } catch { /* decorative — silent fail */ }
    }
    load();
  }, []);

  const items = [
    { value: stats.totalRuns, label: "Benchmarks" },
    { value: stats.totalIdeas, label: "Ideas Generated" },
    { value: stats.totalCritiques, label: "Critiques Written" },
  ];

  return (
    <section className="py-16 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {items.map((item) => (
          <div key={item.label} className="text-center flex-1">
            <AnimatedNumber
              value={item.value}
              className="font-mono text-3xl sm:text-4xl text-text-primary font-medium"
            />
            <p className="label mt-2">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
