"use client";

import { useRef, ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { staggerContainer, fadeUp } from "@/utils/animations";

interface StaggerChildrenProps {
  children: ReactNode;
  className?: string;
  once?: boolean;
}

export default function StaggerChildren({
  children,
  className,
  once = true,
}: StaggerChildrenProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      variants={staggerContainer}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  );
}
