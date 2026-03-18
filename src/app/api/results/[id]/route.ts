import { NextRequest } from "next/server";
import { loadBenchmarkRun } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await loadBenchmarkRun(id);

  if (!run) {
    return Response.json({ error: "Benchmark run not found" }, { status: 404 });
  }

  return Response.json(run);
}
