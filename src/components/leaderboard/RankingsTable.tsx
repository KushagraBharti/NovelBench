"use client";

import { motion } from "framer-motion";
import { LeaderboardEntry } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";

interface RankingsTableProps {
  entries: LeaderboardEntry[];
  title: string;
  subtitle?: string;
}

const placeLabels = ["1st", "2nd", "3rd", "4th"];

export default function RankingsTable({
  entries,
  title,
  subtitle,
}: RankingsTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-2xl text-text-muted/40 mb-2">—</p>
        <p className="text-text-muted text-base">
          No data yet. Run some benchmarks to populate the leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className="font-display text-xl text-text-primary">{title}</h3>
        {subtitle && (
          <p className="text-base font-mono text-text-muted mt-1">{subtitle}</p>
        )}
      </div>

      <div className="border-t border-border">
        {/* Header */}
        <div className="grid grid-cols-[40px_1fr_60px_70px_70px_60px_50px] gap-2 py-2 label">
          <span>#</span>
          <span>Model</span>
          <span className="text-right">Wins</span>
          <span className="text-right">Win %</span>
          <span className="text-right">Score</span>
          <span className="text-right">Rank</span>
          <span className="text-right">Runs</span>
        </div>

        {/* Rows */}
        {entries.map((entry, i) => {
          const model = getModelIdentity(entry.modelId);
          const winRate =
            entry.totalRuns > 0
              ? ((entry.wins / entry.totalRuns) * 100).toFixed(0)
              : "0";

          return (
            <motion.div
              key={entry.modelId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.06 }}
              className="grid grid-cols-[40px_1fr_60px_70px_70px_60px_50px] gap-2 py-3 border-t border-border/50 items-center"
            >
              {/* Place */}
              <span className="font-mono text-base text-text-muted">
                {placeLabels[i] ?? `${i + 1}th`}
              </span>

              {/* Model */}
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: model.color }}
                />
                <div className="min-w-0">
                  <span className="text-base text-text-primary block truncate">
                    {entry.modelName}
                  </span>
                  <span className="text-base text-text-muted font-mono">
                    {model.provider}
                  </span>
                </div>
              </div>

              {/* Wins */}
              <span className="font-mono text-base text-right" style={{ color: "#6BBF7B" }}>
                {entry.wins}
              </span>

              {/* Win Rate */}
              <span className="font-mono text-base text-text-secondary text-right">
                {winRate}%
              </span>

              {/* Avg Score */}
              <span
                className="font-mono text-base font-medium text-right"
                style={{
                  color:
                    entry.averageScore >= 7
                      ? "#6BBF7B"
                      : entry.averageScore >= 5
                        ? "#C9A84C"
                        : "#C75050",
                }}
              >
                {entry.averageScore.toFixed(1)}
              </span>

              {/* Avg Rank */}
              <span className="font-mono text-base text-text-secondary text-right">
                {entry.averageRank.toFixed(2)}
              </span>

              {/* Runs */}
              <span className="font-mono text-base text-text-muted text-right">
                {entry.totalRuns}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
