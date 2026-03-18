import { listBenchmarkRuns } from "@/lib/storage";

export async function GET() {
  const runs = await listBenchmarkRuns();

  // Return summary info (not full content) for the list view
  const summaries = runs.map((run) => ({
    id: run.id,
    categoryId: run.categoryId,
    prompt: run.prompt,
    timestamp: run.timestamp,
    status: run.status,
    modelCount: run.ideas.length,
  }));

  return Response.json(summaries);
}
