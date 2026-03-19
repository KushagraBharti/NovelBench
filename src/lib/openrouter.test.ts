import { describe, expect, it } from "vitest";
import { buildChatCompletionBody } from "@/lib/openrouter";

describe("openrouter request body", () => {
  it("does not hard-cap max_tokens", () => {
    const body = buildChatCompletionBody(
      "openai/gpt-5.4",
      [{ role: "user", content: "Hello" }],
      { reasoning: { effort: "medium", exclude: true } }
    );

    expect(body).not.toHaveProperty("max_tokens");
    expect(body).toMatchObject({
      model: "openai/gpt-5.4",
      temperature: 0.8,
      reasoning: { effort: "medium", exclude: true },
    });
  });

  it("sets streaming only when requested", () => {
    const body = buildChatCompletionBody(
      "openai/gpt-5.4",
      [{ role: "user", content: "Hello" }],
      { stream: true }
    );

    expect(body).toHaveProperty("stream", true);
  });
});
