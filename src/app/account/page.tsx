"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";
import Button from "@/components/ui/Button";

type ProjectMembershipView = {
  id: string;
  userId: string;
  name?: string;
  email?: string;
  projectRole: "editor" | "viewer";
  organizationRole: "owner" | "admin" | "member";
  isCurrentUser: boolean;
};

export default function AccountPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const viewer = useQuery(api.app.currentViewer, isAuthenticated ? {} : "skip");
  const providerStatus = useQuery(api.settings.getProviderStatus, isAuthenticated ? {} : "skip");
  const accessible = useQuery(api.projects.listAccessible, isAuthenticated ? {} : "skip");
  const activeProjectId = viewer?.defaultProjectId ?? undefined;
  const members = useQuery(
    api.projects.listMembers,
    isAuthenticated && activeProjectId ? { projectId: activeProjectId as never } : "skip",
  ) as ProjectMembershipView[] | undefined;
  const saveProviderKeys = useAction(api.settingsActions.saveProviderKeys);
  const setDefaultProject = useMutation(api.app.setDefaultProject);
  const addMemberByEmail = useMutation(api.projects.addMemberByEmail);
  const updateMemberRole = useMutation(api.projects.updateMemberRole);

  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [exaApiKey, setExaApiKey] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleKeySubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(() => {
      void saveProviderKeys({
        openrouterApiKey: openrouterApiKey.trim() || undefined,
        exaApiKey: exaApiKey.trim() || undefined,
      })
        .then(() => {
          setOpenrouterApiKey("");
          setExaApiKey("");
          setMessage("Keys saved.");
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Failed to save keys.");
        });
    });
  }

  function handleInviteSubmit(event: FormEvent) {
    event.preventDefault();
    if (!activeProjectId) return;
    setMessage(null);
    startTransition(() => {
      void addMemberByEmail({
        projectId: activeProjectId as never,
        email: inviteEmail.trim(),
        role: inviteRole,
      })
        .then(() => {
          setInviteEmail("");
          setMessage("Collaborator added.");
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Failed to add collaborator.");
        });
    });
  }

  function handleProjectSwitch(projectId: string) {
    setMessage(null);
    startTransition(() => {
      void setDefaultProject({ projectId: projectId as never })
        .then(() => setMessage("Default project updated."))
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Failed to switch project.");
        });
    });
  }

  function handleRoleChange(membershipId: string, role: "editor" | "viewer") {
    setMessage(null);
    startTransition(() => {
      void updateMemberRole({ membershipId: membershipId as never, role })
        .then(() => setMessage("Member role updated."))
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Failed to update member role.");
        });
    });
  }

  if (isLoading) {
    return <div className="mx-auto max-w-6xl px-6 py-14 text-text-muted">Loading account...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-3xl border-t border-border pt-10">
          <p className="label mb-5">Account</p>
          <h1 className="font-display text-[clamp(3rem,6vw,5rem)] leading-[0.95] text-text-primary">
            Sign in to
            <br />
            unlock your station.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary">
            Connect GitHub to run benchmarks, manage provider keys, and collaborate on public projects.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Button type="button" size="lg" onClick={() => void signIn("github", { redirectTo: "/account" })}>
              Sign in with GitHub
            </Button>
            <Link href="/leaderboard" className="text-base text-text-muted transition-colors hover:text-text-primary">
              Stay public, view rankings →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const operatorName = viewer?.user.name ?? "GitHub Operator";
  const operatorEmail = viewer?.user.email ?? "No email available";
  const openrouterConfigured = providerStatus?.openrouterConfigured ?? false;
  const exaConfigured = providerStatus?.exaConfigured ?? false;

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="border-t border-border pt-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="label mb-5">Account</p>
            <h1 className="font-display text-[clamp(3rem,6vw,5.25rem)] leading-[0.94] text-text-primary">
              {operatorName}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-text-secondary">
              GitHub operator profile attached to the live NovelBench arena.
            </p>
            <p className="mt-2 text-sm uppercase tracking-[0.24em] text-text-muted">
              {operatorEmail}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/arena" className="text-base text-text-muted transition-colors hover:text-text-primary">
              Enter arena →
            </Link>
            <Button type="button" variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-px border border-border bg-border lg:grid-cols-[0.92fr_1.08fr]">
        <section className="bg-bg-deep px-6 py-8 sm:px-8">
          <div className="mb-8 flex items-center justify-between">
            <p className="label">Provider Status</p>
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-text-muted">
              Public Arena
            </span>
          </div>

          <div className="space-y-6">
            <div className="border-b border-border pb-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-2xl text-text-primary">OpenRouter</span>
                <span className={openrouterConfigured ? "text-accent" : "text-text-muted"}>
                  {openrouterConfigured ? "Ready" : "Missing"}
                </span>
              </div>
              <p className="text-base leading-relaxed text-text-secondary">
                Used for all model generation, critique, revision, and voting.
              </p>
            </div>

            <div className="border-b border-border pb-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-2xl text-text-primary">Exa</span>
                <span className={exaConfigured ? "text-accent" : "text-text-muted"}>
                  {exaConfigured ? "Ready" : "Missing"}
                </span>
              </div>
              <p className="text-base leading-relaxed text-text-secondary">
                Powers optional web research during generation and revision.
              </p>
            </div>

            <div className="pt-1 text-sm leading-relaxed text-text-muted">
              Everything ships publicly by default. Projects are collaborative public workspaces, not private vaults.
            </div>
          </div>
        </section>

        <section className="bg-bg-surface px-6 py-8 sm:px-8">
          <div className="mb-8">
            <p className="label mb-4">Bring Your Own Keys</p>
            <p className="max-w-2xl text-base leading-relaxed text-text-secondary">
              Keys are encrypted before storage and only decrypted inside server-side Convex actions during execution.
            </p>
          </div>

          <form onSubmit={handleKeySubmit} className="space-y-8">
            <div className="grid gap-px border border-border bg-border">
              <label className="bg-bg-deep px-5 py-5">
                <span className="label mb-2 block">OpenRouter API Key</span>
                <input
                  type="password"
                  value={openrouterApiKey}
                  onChange={(event) => setOpenrouterApiKey(event.target.value)}
                  className="w-full border-0 bg-transparent px-0 py-0 text-lg text-text-primary outline-none placeholder:text-text-muted/45"
                  placeholder="sk-or-v1-..."
                />
              </label>
              <label className="bg-bg-deep px-5 py-5">
                <span className="label mb-2 block">Exa API Key</span>
                <input
                  type="password"
                  value={exaApiKey}
                  onChange={(event) => setExaApiKey(event.target.value)}
                  className="w-full border-0 bg-transparent px-0 py-0 text-lg text-text-primary outline-none placeholder:text-text-muted/45"
                  placeholder="exa_..."
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Keys"}
              </Button>
              <span className="text-sm text-text-muted">
                Leave a field blank to keep the stored value unchanged.
              </span>
            </div>
          </form>
        </section>
      </div>

      <div className="mt-12 grid gap-px border border-border bg-border lg:grid-cols-[1fr_1fr]">
        <section className="bg-bg-deep px-6 py-8 sm:px-8">
          <div className="mb-8">
            <p className="label mb-4">Workspaces & Projects</p>
            <p className="max-w-2xl text-base leading-relaxed text-text-secondary">
              Pick the project your new runs should launch into. All projects remain publicly visible, but only collaborators can edit them.
            </p>
          </div>

          <div className="space-y-6">
            {accessible?.organizations?.map((organization: any) => (
              <div key={organization.id} className="border-b border-border pb-5 last:border-b-0 last:pb-0">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg text-text-primary">{organization.name}</p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
                      {organization.role} · {organization.kind}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {organization.projects.map((project: any) => (
                    <div key={project.id} className="flex items-center justify-between gap-4 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                      <div>
                        <p className="text-base text-text-primary">{project.name}</p>
                        <p className="text-sm text-text-muted">
                          {project.role} access · {project.visibility.replaceAll("_", " ")}
                        </p>
                      </div>
                      {project.isDefault ? (
                        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                          Current
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleProjectSwitch(project.id)}
                          className="border-b border-border/70 py-1 text-sm text-text-muted transition-colors hover:border-accent hover:text-text-primary"
                        >
                          Make default
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-bg-surface px-6 py-8 sm:px-8">
          <div className="mb-8">
            <p className="label mb-4">Collaboration</p>
            <p className="max-w-2xl text-base leading-relaxed text-text-secondary">
              Invite existing signed-in users by email. Public read stays open; collaboration controls govern who can edit and launch runs.
            </p>
          </div>

          <form onSubmit={handleInviteSubmit} className="grid gap-px border border-border bg-border">
            <label className="bg-bg-deep px-5 py-5">
              <span className="label mb-2 block">Invite collaborator by email</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="w-full border-0 bg-transparent px-0 py-0 text-lg text-text-primary outline-none placeholder:text-text-muted/45"
                placeholder="name@example.com"
              />
            </label>
            <label className="bg-bg-deep px-5 py-5">
              <span className="label mb-2 block">Project role</span>
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}
                className="w-full border-0 bg-transparent px-0 py-0 text-lg text-text-primary outline-none"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <div className="bg-bg-deep px-5 py-5">
              <Button type="submit" disabled={isPending || !activeProjectId || !inviteEmail.trim()}>
                {isPending ? "Updating..." : "Add collaborator"}
              </Button>
            </div>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <p className="label mb-4">Current project members</p>
            <div className="space-y-4">
              {(members ?? []).map((member) => (
                <div key={member.id} className="border-b border-border/70 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-base text-text-primary">
                        {member.name ?? member.email ?? "Unknown member"}
                      </p>
                      <p className="text-sm text-text-muted">
                        {member.email ?? "No email available"} · {member.organizationRole}
                        {member.isCurrentUser ? " · you" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
                        {member.projectRole}
                      </span>
                      {!member.isCurrentUser ? (
                        <select
                          value={member.projectRole}
                          onChange={(event) =>
                            handleRoleChange(member.id, event.target.value as "editor" | "viewer")
                          }
                          className="border-0 border-b border-border/70 bg-transparent px-0 py-1 text-sm text-text-primary outline-none transition-colors focus:border-accent"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              {members?.length === 0 ? (
                <p className="text-sm text-text-muted">No collaborators added yet.</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {message ? (
        <p className="mt-8 text-sm uppercase tracking-[0.18em] text-text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
