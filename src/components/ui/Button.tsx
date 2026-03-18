"use client";

import { ReactNode } from "react";
import { clsx } from "clsx";

interface ButtonProps {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
}

const variants = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  ghost: "text-text-muted hover:text-text-primary",
  outline: "border border-border text-text-primary hover:border-border-hover",
};

const sizes = {
  sm: "px-4 py-2 text-base",
  md: "px-5 py-2.5 text-base",
  lg: "px-7 py-3.5 text-base",
};

export default function Button({
  className,
  variant = "primary",
  size = "md",
  disabled,
  children,
  type = "button",
  onClick,
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-200",
        "disabled:opacity-30 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
