"use client";

import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export default function Skeleton({ className, lines = 1 }: SkeletonProps) {
  if (lines > 1) {
    return (
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              "h-3 rounded bg-bg-elevated animate-shimmer",
              i === lines - 1 ? "w-2/3" : "w-full",
              className
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={clsx("rounded bg-bg-elevated animate-shimmer", className ?? "h-3 w-full")} />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={clsx("border-b border-border py-8 space-y-4", className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton lines={2} />
    </div>
  );
}
