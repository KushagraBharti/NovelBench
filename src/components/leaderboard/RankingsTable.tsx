"use client";

import { motion } from "framer-motion";
import { LeaderboardEntry } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";

interface RankingsTableProps {
  entries: LeaderboardEntry[];
  title: string;
  subtitle?: string;
}

const placeLabels = ["1st", "2nd", "3rd"];

function getPlaceLabel(i: number) {
  return placeLabels[i] ?? `${i + 1}th`;
}

function getScoreColor(score: number) {
  if (score >= 1550) return "#6BBF7B";
  if (score >= 1450) return "#C9A84C";
  return "#C75050";
}

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
      <div className="mb-8">
        <h3 className="font-display text-2xl text-text-primary">{title}</h3>
        {subtitle && (
          <p className="text-base text-text-muted mt-1">{subtitle}</p>
        )}
      </div>

      <div className="border-t border-border">
        {/* Header */}
        <div className="grid grid-cols-[44px_1fr_80px_64px_50px] sm:grid-cols-[44px_1fr_88px_80px_64px_50px] gap-4 py-3 label">
          <span>#</span>
          <span>Model</span>
          <span className="text-right">Rating</span>
          <span className="text-right hidden sm:block">Finish</span>
          <span className="text-right">Wins</span>
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
              transition={{ delay: i * 0.05 }}
              className="group grid grid-cols-[44px_1fr_80px_64px_50px] sm:grid-cols-[44px_1fr_88px_80px_64px_50px] gap-4 py-4 border-t border-border/40 items-center transition-colors hover:bg-white/[0.02]"
            >
              {/* Place */}
              <span className="font-mono text-sm text-text-muted">
                {getPlaceLabel(i)}
              </span>

              {/* Model */}
              <div className="min-w-0">
                <span className="text-base text-text-primary block truncate group-hover:text-accent transition-colors">
                  {entry.modelName}
                  {entry.provisional ? (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-text-muted">
                      provisional
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-text-muted">
                  {model.provider}
                </span>
              </div>

              {/* Rating */}
              <span
                className="font-mono text-base font-medium text-right"
                style={{ color: getScoreColor(entry.rating) }}
              >
                {entry.rating.toFixed(0)}
              </span>

              {/* Avg Finish */}
              <span className="font-mono text-sm text-text-muted text-right hidden sm:block">
                #{entry.averageFinalRank.toFixed(2)}
              </span>

              {/* Wins */}
              <span className="font-mono text-sm text-text-secondary text-right">
                {entry.wins}
                <span className="text-text-muted text-[11px] ml-0.5">/{winRate}%</span>
              </span>

              {/* Runs */}
              <span className="font-mono text-sm text-text-muted text-right">
                {entry.totalRuns}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
