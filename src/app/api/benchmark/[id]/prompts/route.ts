import { loadBenchmarkRun } from "@/lib/storage";
import { buildPromptReview } from "@/lib/prompt-review";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const run = await loadBenchmarkRun(id);

  if (!run) {
    return Response.json({ error: `Run not found: ${id}` }, { status: 404 });
  }

  try {
    return Response.json(buildPromptReview(run));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to build prompt review" },
      { status: 500 }
    );
  }
}
