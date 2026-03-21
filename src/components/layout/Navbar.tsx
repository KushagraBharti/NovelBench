"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import AuthControls from "@/components/auth/AuthControls";

const publicNavItems = [
  { href: "/", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
];

const privateNavItems = [
  { href: "/", label: "Dashboard" },
  { href: "/arena", label: "Arena" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/archive", label: "Archive" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const [logoSpin, setLogoSpin] = useState(false);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navItems = isAuthenticated ? privateNavItems : publicNavItems;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  function handleLogoClick() {
    setLogoClicks((p) => p + 1);
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => setLogoClicks(0), 500);
    if (logoClicks >= 2) {
      setLogoSpin(true);
      setLogoClicks(0);
      setTimeout(() => setLogoSpin(false), 800);
    }
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className={clsx(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-bg-deep/90 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      )}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" onClick={handleLogoClick} className="flex items-center gap-2">
          <motion.span
            animate={logoSpin ? { rotateY: 360 } : {}}
            transition={{ duration: 0.6 }}
            className="font-display text-xl text-text-primary tracking-tight"
          >
            NovelBench
          </motion.span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "relative text-base font-medium tracking-wide transition-colors duration-200",
                isActive(item.href)
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              {item.label}
              {isActive(item.href) && (
                <motion.div
                  layoutId="nav-dot"
                  className="absolute -bottom-1.5 left-0 right-0 mx-auto w-1 h-1 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          ))}
          <AuthControls />
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-text-muted hover:text-text-primary text-base"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-bg-deep/95 backdrop-blur-md border-b border-border overflow-hidden"
          >
            <div className="px-6 py-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "block py-2 text-base transition-colors",
                    isActive(item.href) ? "text-text-primary" : "text-text-muted"
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="pt-3 border-t border-border/60">
                <AuthControls />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
