import { describe, expect, it } from "vitest";
import {
  MODEL_SELECTION_LIMITS,
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
    const defaults = getDefaultModels();
    expect(defaults.length).toBeGreaterThanOrEqual(MODEL_SELECTION_LIMITS.min);
    expect(defaults.length).toBeLessThanOrEqual(MODEL_SELECTION_LIMITS.max);
    expect(defaults.every((model) => model.active && model.defaultEnabled)).toBe(true);
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

  it("resolves mixed active and older selections into run participants", () => {
    const models = resolveSelectedModels(
      ["gpt-5.5", "claude-opus-4.6", "gemini-3.1-flash", "deepseek-v3.2"],
      []
    );
    expect(models.map((model) => model.id)).toEqual([
      "gpt-5.5",
      "claude-opus-4.6",
      "gemini-3.1-flash",
      "deepseek-v3.2",
    ]);
    expect(models.map((model) => model.active)).toEqual([true, false, false, false]);
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
