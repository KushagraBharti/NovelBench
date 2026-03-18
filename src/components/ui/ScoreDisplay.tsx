"use client";

import { useEffect, useState, useRef } from "react";
import { useInView } from "framer-motion";
import { clsx } from "clsx";

interface ScoreDisplayProps {
  score: number;
  maxScore?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

function getScoreColor(score: number, max: number): string {
  const ratio = score / max;
  if (ratio >= 0.7) return "#6BBF7B";
  if (ratio >= 0.5) return "#C9A84C";
  return "#C75050";
}

export default function ScoreDisplay({
  score,
  maxScore = 10,
  size = "md",
  showLabel = true,
  animated = true,
  className,
}: ScoreDisplayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const [displayScore, setDisplayScore] = useState(animated ? 0 : score);
  const [isScrambling, setIsScrambling] = useState(false);
  const color = getScoreColor(score, maxScore);

  useEffect(() => {
    if (!animated || !isInView) return;

    // Brief scramble effect
    setIsScrambling(true);
    const scrambleInterval = setInterval(() => {
      setDisplayScore(Math.random() * maxScore);
    }, 50);

    const timer = setTimeout(() => {
      clearInterval(scrambleInterval);
      setIsScrambling(false);
      setDisplayScore(score);
    }, 400);

    return () => {
      clearInterval(scrambleInterval);
      clearTimeout(timer);
    };
  }, [isInView, score, maxScore, animated]);

  const sizes = {
    sm: "text-xl",
    md: "text-3xl",
    lg: "text-5xl",
  };

  return (
    <div ref={ref} className={clsx("flex items-baseline gap-1 font-mono", className)}>
      <span
        className={clsx(
          "font-bold tabular-nums transition-colors duration-300",
          sizes[size],
          isScrambling && "opacity-60"
        )}
        style={{ color }}
      >
        {displayScore.toFixed(1)}
      </span>
      {showLabel && (
        <span className="text-text-muted text-base">/{maxScore}</span>
      )}
    </div>
  );
}
