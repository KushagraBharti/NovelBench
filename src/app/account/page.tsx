"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";
import Button from "@/components/ui/Button";

export default function AccountPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.app.currentViewer, isAuthenticated ? {} : "skip");
  const workspace = useQuery(api.projects.listAccessible, isAuthenticated ? {} : "skip");

  if (isLoading) {
    return <div className="mx-auto max-w-5xl px-6 py-10 text-text-muted">Loading account...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-[2rem] border border-border bg-bg-surface/70 p-8">
          <p className="label mb-3">Account</p>
          <h1 className="font-display text-4xl text-text-primary">Sign in required</h1>
          <p className="mt-3 text-text-secondary">
            Your account area is private. Sign in first to manage keys, projects, and exports.
          </p>
          <div className="mt-6">
            <Link
              href="/sign-in?redirect=%2Faccount"
              className="inline-flex items-center rounded-lg bg-accent px-6 py-3 text-white transition-colors hover:bg-accent-hover"
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const organizations = (workspace?.organizations ?? []) as Array<{
    id: string;
    name: string;
    role: string;
    projects: Array<{ id: string; name: string; isDefault: boolean; visibility: string }>;
  }>;

  const defaultOrg = organizations.find((organization) =>
    organization.projects.some((project) => project.isDefault),
  );
  const defaultProject = defaultOrg?.projects.find((project) => project.isDefault);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-border bg-bg-surface/70 p-8">
          <p className="label mb-4">Account</p>
          <div className="flex items-start gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border/70 bg-bg-deep text-2xl font-display text-text-primary">
              {(viewer?.user.name ?? viewer?.user.email ?? "N").slice(0, 1).toUpperCase()}
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-4xl text-text-primary">
                {viewer?.user.name ?? "GitHub Operator"}
              </h1>
              <p className="text-base text-text-secondary">{viewer?.user.email ?? "No email available"}</p>
              <div className="inline-flex rounded-full border border-border/70 px-3 py-1 text-xs uppercase tracking-[0.22em] text-text-muted">
                GitHub Connected
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-bg-deep/70 p-5">
              <p className="label mb-2">OpenRouter</p>
              <p className="text-lg text-text-primary">
                {viewer?.providerStatus.openrouterConfigured ? "Configured" : "Missing"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-bg-deep/70 p-5">
              <p className="label mb-2">Exa</p>
              <p className="text-lg text-text-primary">
                {viewer?.providerStatus.exaConfigured ? "Configured" : "Missing"}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center rounded-lg border border-border px-5 py-3 text-text-primary transition-colors hover:border-border-hover"
            >
              Open advanced settings
            </Link>
            <Button type="button" variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-[2rem] border border-border bg-bg-deep/85 p-8">
            <p className="label mb-4">Active Workspace</p>
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-bg-surface/50 p-5">
                <p className="label mb-1">Organization</p>
                <p className="text-xl text-text-primary">{defaultOrg?.name ?? "Provisioning..."}</p>
                <p className="mt-1 text-sm text-text-muted">{defaultOrg?.role ?? "owner"}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-bg-surface/50 p-5">
                <p className="label mb-1">Default Project</p>
                <p className="text-xl text-text-primary">{defaultProject?.name ?? "Provisioning..."}</p>
                <p className="mt-1 text-sm text-text-muted">
                  visibility {defaultProject?.visibility ?? "private"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-border bg-bg-surface/70 p-8">
            <p className="label mb-4">What's Unlocked</p>
            <ul className="space-y-3 text-text-secondary">
              <li>Private arena launches and live run controls</li>
              <li>Archive access and export downloads</li>
              <li>Workspace policy, budgets, and diagnostics</li>
              <li>Encrypted BYOK storage for OpenRouter and Exa</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
