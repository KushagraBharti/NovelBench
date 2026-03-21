"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function AuthControls() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.app.currentViewer, isAuthenticated ? {} : "skip");
  const bootstrapViewer = useMutation(api.app.bootstrapViewer);
  const [, startTransition] = useTransition();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !viewer || bootstrapped) {
      return;
    }
    if (viewer.defaultOrgId && viewer.defaultProjectId) {
      setBootstrapped(true);
      return;
    }
    startTransition(() => {
      void bootstrapViewer({}).then(() => {
        setBootstrapped(true);
      });
    });
  }, [bootstrapped, bootstrapViewer, isAuthenticated, viewer]);

  if (isLoading) {
    return <div className="text-sm text-text-muted">Auth...</div>;
  }

  if (!isAuthenticated) {
    return (
      <Link
        href={`/sign-in?redirect=${encodeURIComponent(pathname || "/")}`}
        className="inline-flex items-center rounded-full border border-border/70 px-4 py-2 text-sm text-text-muted hover:text-text-primary hover:border-border transition-colors"
      >
        Sign In
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link
        href="/account"
        className="inline-flex items-center rounded-full border border-border/70 px-4 py-2 text-sm text-text-muted hover:text-text-primary hover:border-border transition-colors"
      >
        Account
      </Link>
    </div>
  );
}
