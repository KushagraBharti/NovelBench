"use client";

import Link from "next/link";
import { useEffect, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import Button from "@/components/ui/Button";

const reasons = [
  "Launch benchmark runs",
  "Open the private archive",
  "Store BYOK provider keys securely",
  "Manage your workspace and policy",
];

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = useMemo(() => {
    const redirect = searchParams.get("redirect");
    return redirect && redirect.startsWith("/") ? redirect : "/account";
  }, [searchParams]);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirectTarget);
    }
  }, [isAuthenticated, isLoading, redirectTarget, router]);

  return (
    <div className="relative overflow-hidden px-6 py-12 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(212,99,74,0.35), transparent 28%), radial-gradient(circle at 80% 10%, rgba(255,255,255,0.12), transparent 24%), linear-gradient(135deg, rgba(255,255,255,0.02), transparent 52%)",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-[2rem] border border-border/80 bg-bg-surface/70 p-8 backdrop-blur md:p-12"
        >
          <p className="label mb-6">Operator Access</p>
          <h1 className="font-display text-5xl leading-[0.95] text-text-primary sm:text-6xl">
            Enter the
            <br />
            private control room.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
            NovelBench keeps the public scoreboard open, but the arena itself is private.
            Sign in with GitHub to run head-to-head competitions, manage keys, and keep your
            workspace under your control.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              size="lg"
              className="min-w-[220px]"
              disabled={isLoading || isPending}
              onClick={() => {
                startTransition(() => {
                  void signIn("github", { redirectTo: redirectTarget });
                });
              }}
            >
              {isPending ? "Redirecting..." : "Sign in with GitHub"}
            </Button>
            <Link
              href="/leaderboard"
              className="text-base text-text-muted transition-colors hover:text-text-primary"
            >
              Stay public, view rankings →
            </Link>
          </div>
        </motion.section>

        <motion.aside
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="rounded-[2rem] border border-border/80 bg-bg-deep/85 p-8"
        >
          <div className="mb-8 flex items-center justify-between">
            <p className="label">After Sign In</p>
            <span className="rounded-full border border-border/70 px-3 py-1 text-xs uppercase tracking-[0.22em] text-text-muted">
              GitHub Only
            </span>
          </div>

          <div className="space-y-4">
            {reasons.map((reason, index) => (
              <motion.div
                key={reason}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.18 + index * 0.06 }}
                className="rounded-2xl border border-border/70 bg-bg-surface/50 px-5 py-4"
              >
                <div className="flex items-start gap-4">
                  <span className="font-mono text-sm text-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-base text-text-secondary">{reason}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-border/70 bg-black/10 p-5">
            <p className="label mb-2">Redirect Target</p>
            <p className="break-all text-sm text-text-secondary">{redirectTarget}</p>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
