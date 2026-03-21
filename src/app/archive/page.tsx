import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import ArchiveClient from "@/components/archive/ArchiveClient";
import { fetchArchivePage } from "@/lib/convex-server";

function asSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAuthenticatedNextjs())) {
    redirect("/sign-in?redirect=%2Farchive");
  }

  const params = await searchParams;
  const query = asSingle(params.q)?.trim() || undefined;
  const categoryId = asSingle(params.category) || undefined;
  const status = asSingle(params.status) || undefined;
  const cursor = asSingle(params.cursor) || null;
  const from = asSingle(params.from) || "";
  const to = asSingle(params.to) || "";
  const createdAfter = from ? Date.parse(`${from}T00:00:00.000Z`) : undefined;
  const createdBefore = to ? Date.parse(`${to}T23:59:59.999Z`) : undefined;
  const page = await fetchArchivePage({
    query,
    categoryId,
    status,
    cursor,
    createdAfter,
    createdBefore,
    visibility: "public_full",
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl text-text-primary">Archive</h1>
          <p className="text-text-secondary text-base mt-2">
            Browse all past benchmark runs
          </p>
        </div>
        <Link href="/arena" className="text-base text-text-muted hover:text-accent transition-colors">
          New Benchmark &rarr;
        </Link>
      </div>

      <ArchiveClient
        runs={page.page}
        nextCursor={page.continueCursor}
        hasMore={!page.isDone}
        filters={{
          query: query ?? "",
          categoryId: categoryId ?? "all",
          status: status ?? "all",
          from,
          to,
        }}
      />
    </div>
  );
}
