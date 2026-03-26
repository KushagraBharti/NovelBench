"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ranking, AggregatedScore } from "@/types";
import { getModelIdentity } from "@/utils/model-identity";
import { getModelName } from "@/lib/models";

interface RankingDisplayProps {
  rankings: Ranking[];
  title: string;
  showPodium?: boolean;
  showReasoning?: boolean;
}

function aggregateRankings(rankings: Ranking[]): AggregatedScore[] {
  const scoreMap = new Map<string, { totalRank: number; totalScore: number; count: number }>();
  for (const ranking of rankings) {
    for (const entry of ranking.rankings) {
      const existing = scoreMap.get(entry.modelId) || { totalRank: 0, totalScore: 0, count: 0 };
      existing.totalRank += entry.rank;
      existing.totalScore += entry.score;
      existing.count += 1;
      scoreMap.set(entry.modelId, existing);
    }
  }
  const scores: AggregatedScore[] = [];
  for (const [modelId, data] of scoreMap) {
    scores.push({
      modelId,
      modelName: getModelName(modelId),
      averageRank: data.count > 0 ? data.totalRank / data.count : 0,
      averageScore: data.count > 0 ? data.totalScore / data.count : 0,
      critiqueScoreAvg: 0,
    });
  }
  scores.sort((a, b) => a.averageRank - b.averageRank);
  return scores;
}

const placeLabels = ["1st", "2nd", "3rd", "4th"];

export default function RankingDisplay({ rankings, title, showPodium, showReasoning }: RankingDisplayProps) {
  const [showJudges, setShowJudges] = useState(false);
  const [showReasoningPanel, setShowReasoningPanel] = useState(false);
  if (rankings.length === 0) return null;
  const scores = aggregateRankings(rankings);

  return (
    <div>
      <h3 className="font-display text-xl text-text-primary mb-6">{title}</h3>

      {/* Podium — typographic, not visual blocks */}
      {showPodium && scores.length >= 3 && (
        <div className="mb-10 text-center">
          <p className="label mb-6">Final Standings</p>
          <div className="flex items-end justify-center gap-8 sm:gap-16">
            {[scores[1], scores[0], scores[2]].map((score, i) => {
              const model = getModelIdentity(score.modelId);
              const place = i === 0 ? 1 : i === 1 ? 0 : 2;
              return (
                <motion.div
                  key={score.modelId}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + (i === 1 ? 0.3 : i * 0.12) }}
                  className="text-center"
                >
                  <span className="font-display text-4xl sm:text-5xl text-text-primary block mb-1"
                    style={place === 0 ? { color: "var(--color-accent)" } : {}}
                  >
                    {placeLabels[place]}
                  </span>
                  <span className="text-base text-text-secondary block mb-2">{score.modelName}</span>
                  <span className="font-mono text-base text-text-muted block">
                    {score.averageScore.toFixed(1)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table — clean data */}
      <div className="border-t border-border">
        {/* Header */}
        <div className="grid grid-cols-[40px_1fr_70px_70px] gap-4 py-2 label">
          <span>#</span>
          <span>Model</span>
          <span className="text-right">Rank</span>
          <span className="text-right">Score</span>
        </div>

        {/* Rows */}
        {scores.map((score, i) => {
          const model = getModelIdentity(score.modelId);
          return (
            <motion.div
              key={score.modelId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.06 }}
              className="grid grid-cols-[40px_1fr_70px_70px] gap-4 py-3 border-t border-border/50 items-center"
            >
              <span className="font-mono text-base text-text-muted">{placeLabels[i] ?? `${i + 1}th`}</span>
              <span className="text-base text-text-primary">{score.modelName}</span>
              <span className="font-mono text-base text-text-secondary text-right">{score.averageRank.toFixed(2)}</span>
              <span
                className="font-mono text-base font-medium text-right"
                style={{
                  color: score.averageScore >= 7 ? "#6BBF7B" : score.averageScore >= 5 ? "#C9A84C" : "#C75050",
                }}
              >
                {score.averageScore.toFixed(1)}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Judge breakdown */}
      <div className="mt-4">
        <button
          onClick={() => setShowJudges(!showJudges)}
          className="text-base text-text-muted hover:text-text-secondary transition-colors"
        >
          {showJudges ? "Hide" : "Show"} judge details
        </button>

        <AnimatePresence>
          {showJudges && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-5 border-t border-border">
                <div className="grid grid-cols-1 gap-6 pt-4 sm:grid-cols-2">
                  {rankings.map((ranking) => {
                    const judge = getModelIdentity(ranking.judgeModelId);
                    return (
                      <div key={ranking.judgeModelId} className="border-b border-border/50 pb-5 last:border-b-0 sm:last:border-b sm:last:pb-5">
                        <p className="text-base text-text-muted mb-3">{judge.name}</p>
                        <div className="space-y-3">
                          {[...ranking.rankings].sort((a, b) => a.rank - b.rank).map((entry) => {
                            const m = getModelIdentity(entry.modelId);
                            return (
                              <div key={entry.modelId} className="flex items-center gap-2 text-base">
                                <span className="font-mono text-text-muted w-5">#{entry.rank}</span>
                                <span className="text-text-secondary flex-1">{m.name}</span>
                                <span
                                  className="font-mono"
                                  style={{ color: entry.score >= 7 ? "#6BBF7B" : entry.score >= 5 ? "#C9A84C" : "#C75050" }}
                                >
                                  {entry.score}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {showReasoning && (
                  <div className="border-t border-border pt-4">
                    <button
                      onClick={() => setShowReasoningPanel((value) => !value)}
                      className="text-base text-text-muted hover:text-text-secondary transition-colors"
                    >
                      {showReasoningPanel ? "Hide" : "Show"} why each model landed here
                    </button>

                    <AnimatePresence>
                      {showReasoningPanel && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-5 space-y-6">
                            {scores.map((score) => {
                              const model = getModelIdentity(score.modelId);
                              const judgeReasons = rankings
                                .map((ranking) => {
                                  const entry = ranking.rankings.find((candidate) => candidate.modelId === score.modelId);
                                  if (!entry?.reasoning) return null;
                                  return {
                                    judge: getModelIdentity(ranking.judgeModelId),
                                    rank: entry.rank,
                                    score: entry.score,
                                    reasoning: entry.reasoning,
                                  };
                                })
                                .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

                              return (
                                <div key={score.modelId} className="border-b border-border/60 pb-5 last:border-0 last:pb-0">
                                  <div className="flex items-center gap-2.5 mb-3">
                                    <span className="text-base text-text-primary">{score.modelName}</span>
                                    <span className="font-mono text-[11px] text-text-muted ml-auto">
                                      #{score.averageRank.toFixed(2)} · {score.averageScore.toFixed(1)}
                                    </span>
                                  </div>
                                  <div className="space-y-3">
                                    {judgeReasons.map((entry) => (
                                      <div key={`${score.modelId}-${entry.judge.name}`} className="border-l border-border pl-4">
                                        <div className="flex items-center gap-2 text-sm text-text-muted">
                                          <span>{entry.judge.name}</span>
                                          <span className="font-mono ml-auto">#{entry.rank} · {entry.score}/10</span>
                                        </div>
                                        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                                          {entry.reasoning}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
