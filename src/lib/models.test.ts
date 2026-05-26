import { describe, expect, it } from "vitest";
import {
  createBringYourOwnModel,
  getDefaultModels,
  getModelCatalog,
  getModelById,
  getModelIdentityById,
  isValidOpenRouterModelId,
  resolveSelectedModels,
} from "@/lib/models";

describe("model catalog", () => {
  it("keeps a default roster", () => {
    expect(getDefaultModels().length).toBeGreaterThanOrEqual(4);
    expect(getDefaultModels().map((model) => model.id)).toEqual([
      "gpt-5.5",
      "claude-opus-4.7",
      "gemini-3.1-pro",
      "gemini-3.1-flash",
      "grok-4.3",
      "deepseek-v4-pro",
      "kimi-k2.6",
    ]);
  });

  it("validates OpenRouter ids and creates BYOM entries", () => {
    expect(isValidOpenRouterModelId("openai/gpt-5.5")).toBe(true);
    expect(isValidOpenRouterModelId("bad-model")).toBe(false);
    expect(createBringYourOwnModel("openai/gpt-5.5").openRouterId).toBe("openai/gpt-5.5");
  });

  it("keeps older model identities selectable without putting them in the active roster", () => {
    expect(getModelCatalog().some((model) => model.id === "gpt-5.4")).toBe(false);
    expect(getModelById("gpt-5.4")?.active).toBe(false);
    expect(getModelIdentityById("gpt-5.4")?.name).toBe("GPT-5.4");
    expect(resolveSelectedModels(["gpt-5.4"], [])[0]?.openRouterId).toBe("openai/gpt-5.4");
  });

  it("dedupes selected and custom models", () => {
    const models = resolveSelectedModels(["gpt-5.5"], ["openai/gpt-5.5", "custom/provider"]);
    expect(models.length).toBe(2);
  });

  it("preserves duplicate selections as separate slots", () => {
    const models = resolveSelectedModels(
      ["gpt-5.5", "gpt-5.5"],
      ["google/gemini-3.1-flash", "google/gemini-3.1-flash"]
    );
    expect(models).toHaveLength(4);
    expect(models[0]?.openRouterId).toBe("openai/gpt-5.5");
    expect(models[1]?.openRouterId).toBe("openai/gpt-5.5");
    expect(models[0]?.id).not.toBe(models[1]?.id);
    expect(models[2]?.openRouterId).toBe("google/gemini-3.1-flash");
    expect(models[3]?.openRouterId).toBe("google/gemini-3.1-flash");
  });
});
