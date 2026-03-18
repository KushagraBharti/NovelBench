"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  available: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
}

export default function Tabs({ tabs, activeTab, onTabChange, children }: TabsProps) {
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  function handleTabClick(tabId: string) {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    const nextIndex = tabs.findIndex((t) => t.id === tabId);
    setDirection(nextIndex > currentIndex ? 1 : -1);
    onTabChange(tabId);
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="relative flex gap-6 border-b border-border mb-8 overflow-x-auto pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => { if (el) tabRefs.current.set(tab.id, el); }}
            onClick={() => tab.available && handleTabClick(tab.id)}
            disabled={!tab.available}
            className={clsx(
              "relative pb-3 text-base font-medium whitespace-nowrap transition-colors",
              activeTab === tab.id
                ? "text-text-primary"
                : tab.available
                  ? "text-text-muted hover:text-text-secondary"
                  : "text-text-muted/30 cursor-not-allowed"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="font-mono text-base text-text-muted ml-1.5">
                {tab.count}
              </span>
            )}
          </button>
        ))}

        {/* Animated underline */}
        <motion.div
          className="absolute bottom-0 h-px bg-text-primary"
          animate={{ left: indicatorStyle.left, width: indicatorStyle.width }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={activeTab}
          custom={direction}
          initial={{ x: direction > 0 ? 16 : -16, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction > 0 ? -16 : 16, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
