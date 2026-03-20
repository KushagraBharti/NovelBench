import { NextRequest } from "next/server";
import { loadBenchmarkRun } from "@/lib/storage";
import { getRunEventBus } from "@/lib/run-events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await loadBenchmarkRun(id);

  if (!run) {
    return Response.json({ error: "Benchmark run not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = getRunEventBus().subscribe(id, (event) => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify(
                event.type === "progress"
                  ? event.payload
                  : event.type === "token"
                    ? { type: "token", ...event.payload }
                    : { type: "tool", ...event.payload }
              )}\n\n`
            )
          );
        } catch {
          unsubscribe();
        }
      });

      const initial = JSON.stringify({
        status: run.status,
        step: run.currentStep,
        run,
      });
      controller.enqueue(encoder.encode(`data: ${initial}\n\n`));

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepAlive);
          unsubscribe();
        }
      }, 15_000);

      return () => {
        clearInterval(keepAlive);
        unsubscribe();
      };
    },
    cancel() {
      // No-op. cleanup handled in start teardown.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
