"use client";

import { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";

interface CardProps {
  className?: string;
  hover?: boolean;
  glowColor?: string;
  borderColor?: string;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
  onClick?: () => void;
}

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export default function Card({
  className,
  hover = false,
  glowColor,
  borderColor,
  padding = "md",
  children,
  onClick,
}: CardProps) {
  const cardClass = clsx(
    "bg-bg-surface border border-border rounded-2xl transition-all duration-200",
    hover && "cursor-pointer hover:border-border-hover",
    paddings[padding],
    className
  );

  const cardStyle: CSSProperties = {
    ...(borderColor ? { borderColor } : {}),
    ...(glowColor
      ? { boxShadow: `0 0 20px ${glowColor}15, 0 0 60px ${glowColor}05` }
      : {}),
  };

  if (hover) {
    return (
      <motion.div
        whileHover={{ y: -4, transition: { duration: 0.2, ease: "easeOut" } }}
        className={cardClass}
        style={cardStyle}
        onClick={onClick}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={cardClass} style={cardStyle} onClick={onClick}>
      {children}
    </div>
  );
}
