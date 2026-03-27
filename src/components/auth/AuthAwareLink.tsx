"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fallbackContent = children ?? signedInChildren ?? signedOutChildren;
  const content = !isMounted
    ? fallbackContent
    : isAuthenticated
      ? (signedInChildren ?? children)
      : (signedOutChildren ?? children);
  const targetHref = !isMounted
    ? href
    : isAuthenticated
      ? href
      : buildSignInHref(href);

  return (
    <Link href={targetHref} className={className}>
      {content}
    </Link>
  );
}
