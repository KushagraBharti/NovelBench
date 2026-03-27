import { notFound } from "next/navigation";
import RunDetailClient from "@/components/runs/RunDetailClient";
import { fetchRun, fetchRunViewerCanEdit } from "@/lib/convex-server";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [run, canEdit] = await Promise.all([fetchRun(id), fetchRunViewerCanEdit(id)]);

  if (!run) {
    notFound();
  }

  return <RunDetailClient runId={id} initialRun={run} canEdit={canEdit} />;
}
