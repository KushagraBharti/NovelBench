import { NextRequest } from "next/server";
import { runBenchmark } from "@/lib/engine";

// Allow up to 5 minutes for the full benchmark (4 stages, multiple model calls)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { categoryId, prompt } = await request.json();

  if (!categoryId || !prompt) {
    return Response.json(
      { error: "categoryId and prompt are required" },
      { status: 400 }
    );
  }

  // Use Server-Sent Events to stream progress
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const onToken = (modelId: string, stage: string, chunk: string) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "token", modelId, stage, chunk })}\n\n`)
          );
        } catch {
          // controller may be closed if client disconnected
        }
      };

      try {
        for await (const progress of runBenchmark(categoryId, prompt, { onToken })) {
          const data = JSON.stringify(progress);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ status: "error", step: errorMsg })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
