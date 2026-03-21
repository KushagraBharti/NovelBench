"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useConvexAuth } from "convex/react";

function buildSignInHref(targetHref: string) {
  return `/sign-in?redirect=${encodeURIComponent(targetHref)}`;
}

export default function AuthAwareLink({
  href,
  className,
  signedInChildren,
  signedOutChildren,
  children,
}: {
  href: string;
  className?: string;
  signedInChildren?: ReactNode;
  signedOutChildren?: ReactNode;
  children?: ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const content = isAuthenticated
    ? (signedInChildren ?? children)
    : (signedOutChildren ?? children);

  return (
    <Link href={isAuthenticated ? href : buildSignInHref(href)} className={className}>
      {content}
    </Link>
  );
}
