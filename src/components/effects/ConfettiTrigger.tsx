"use client";

import { useCallback } from "react";
import confetti from "canvas-confetti";

export function useConfetti() {
  const fireConfetti = useCallback((color?: string) => {
    const colors = color
      ? [color, "#F5A623", "#F0ECE5"]
      : ["#F5A623", "#3B82F6", "#A78BFA", "#2DD4BF", "#FB923C"];

    // Center burst
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors,
      disableForReducedMotion: true,
    });

    // Side bursts
    setTimeout(() => {
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        colors,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        colors,
        disableForReducedMotion: true,
      });
    }, 200);
  }, []);

  return fireConfetti;
}
