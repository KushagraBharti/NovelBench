import Link from "next/link";
import { notFound } from "next/navigation";
import ResultsView from "@/components/results/ResultsView";
import { fetchArchiveDetailRun } from "@/lib/convex-server";
import { getCategoryIdentity } from "@/utils/category-identity";

export default async function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await fetchArchiveDetailRun(id);

  if (!run) {
    notFound();
  }

  const category = getCategoryIdentity(run.categoryId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/archive"
        className="inline-block text-base text-text-muted transition-colors hover:text-text-secondary"
      >
        &larr; Archive
      </Link>

      <div className="mt-8 border-t border-border pt-8">
        <div className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted">
                {run.categoryId}
              </span>
            </div>
            <h1 className="max-w-4xl font-display text-3xl leading-tight text-text-primary sm:text-4xl">
              Archived benchmark
            </h1>
            <p className="max-w-3xl text-base leading-relaxed text-text-secondary">
              {run.prompt}
            </p>
          </div>

          <div className="space-y-2 text-left sm:text-right">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
              {run.status.replaceAll("_", " ")}
            </p>
            <p className="font-mono text-sm text-text-muted">
              {new Date(run.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <ResultsView run={run} />
      </div>
    </div>
  );
}
