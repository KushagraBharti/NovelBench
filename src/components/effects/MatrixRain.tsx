"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MatrixRainProps {
  active: boolean;
  onComplete?: () => void;
  duration?: number;
}

const JSON_CHARS = '{}[]":,0123456789truefalsenull.abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default function MatrixRain({
  active,
  onComplete,
  duration = 5000,
}: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = new Array(columns).fill(0).map(() => Math.random() * -50);

    const colors = ["#F5A623", "#3B82F6", "#A78BFA", "#2DD4BF", "#4ADE80"];

    function draw() {
      if (!ctx || !canvas) return;
      ctx.fillStyle = "rgba(6, 6, 10, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = JSON_CHARS[Math.floor(Math.random() * JSON_CHARS.length)];
        const color = colors[Math.floor(Math.random() * colors.length)];

        ctx.fillStyle = color + "80";
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);

        // Brighter head
        if (Math.random() > 0.95) {
          ctx.fillStyle = color;
          ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        }

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) {
          drops[i] = 0;
        }
        drops[i] += 0.5 + Math.random() * 0.5;
      }
    }

    const interval = setInterval(draw, 40);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      onComplete?.();
    }, duration);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [active, duration, onComplete]);

  return (
    <AnimatePresence>
      {active && (
        <motion.canvas
          ref={canvasRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[99997] pointer-events-none"
        />
      )}
    </AnimatePresence>
  );
}
