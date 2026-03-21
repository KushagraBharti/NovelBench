import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import BenchmarkDetailClient from "@/components/arena/BenchmarkDetailClient";
import { fetchRun } from "@/lib/convex-server";

export default async function BenchmarkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await isAuthenticatedNextjs())) {
    redirect(`/sign-in?redirect=${encodeURIComponent(`/arena/${id}`)}`);
  }

  const run = await fetchRun(id);

  if (!run) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Link
          href="/archive"
          className="text-base text-text-muted hover:text-text-secondary transition-colors mb-6 inline-block"
        >
          &larr; Archive
        </Link>
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <h2 className="font-display text-2xl text-text-primary mb-2">Benchmark not found</h2>
          <p className="text-base text-text-muted mb-4">
            This benchmark may have been deleted or the ID is incorrect.
          </p>
          <Link
            href="/archive"
            className="text-base text-accent hover:text-accent-hover transition-colors"
          >
            Browse all benchmarks
          </Link>
        </div>
      </div>
    );
  }

  return <BenchmarkDetailClient runId={id} initialRun={run} />;
}
