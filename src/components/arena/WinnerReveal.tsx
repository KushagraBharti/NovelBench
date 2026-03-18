"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BenchmarkRun } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";
import { useConfetti } from "@/components/effects/ConfettiTrigger";

function getWinner(run: BenchmarkRun): { modelId: string; avgRank: number } | null {
  if (run.finalRankings.length === 0) return null;
  const scoreMap = new Map<string, { totalRank: number; count: number }>();
  for (const ranking of run.finalRankings) {
    for (const entry of ranking.rankings) {
      const existing = scoreMap.get(entry.modelId) || { totalRank: 0, count: 0 };
      existing.totalRank += entry.rank;
      existing.count += 1;
      scoreMap.set(entry.modelId, existing);
    }
  }
  let winner = { modelId: "", avgRank: Infinity };
  for (const [modelId, data] of scoreMap) {
    const avg = data.totalRank / data.count;
    if (avg < winner.avgRank) winner = { modelId, avgRank: avg };
  }
  return winner.modelId ? winner : null;
}

export default function WinnerReveal({
  run,
  show,
  onDismiss,
}: {
  run: BenchmarkRun;
  show: boolean;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const fireConfetti = useConfetti();
  const winner = getWinner(run);

  useEffect(() => {
    if (show && winner) {
      setVisible(true);
      const model = getModelIdentity(winner.modelId);
      setTimeout(() => fireConfetti(model.color), 600);
      setTimeout(() => { setVisible(false); onDismiss(); }, 3500);
    }
  }, [show, winner, fireConfetti, onDismiss]);

  if (!winner) return null;
  const model = getModelIdentity(winner.modelId);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          onClick={() => { setVisible(false); onDismiss(); }}
        >
          <div className="absolute inset-0 bg-bg-deep/90 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative z-10 text-center"
          >
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="label mb-6"
            >
              Winner
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="font-display text-5xl sm:text-6xl text-text-primary mb-3"
            >
              {model.name}
            </motion.h2>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex items-center justify-center gap-3"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: model.color }}
              />
              <span className="font-mono text-base text-text-secondary">
                Avg Rank {winner.avgRank.toFixed(2)}
              </span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="text-base text-text-muted mt-8"
            >
              Click anywhere to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
