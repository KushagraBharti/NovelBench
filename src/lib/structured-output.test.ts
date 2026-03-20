import { describe, expect, it } from "vitest";
import { getCategoryById } from "@/lib/categories";
import {
  isUsableIdeaResponse,
  normalizeCritiqueVoteResponse,
  normalizeFinalVoteResponse,
  normalizeIdeaContent,
} from "@/lib/structured-output";

describe("structured output normalization", () => {
  const frontier = getCategoryById("frontier");

  it("parses fenced JSON idea responses", () => {
    const raw = [
      "```json",
      "{",
      '  "title": "Institutional Physics for Agentic AI",',
      '  "summary": "Learn hidden rules of organizations from action traces.",',
      '  "problemGap": "Organizations hide causal state that current agent benchmarks miss.",',
      '  "hypothesis": "Agents can model hidden institutional state.",',
      '  "approach": "Deploy in shadow mode before bounded autonomy.",',
      '  "decisiveTest": "Run side-by-side predictions on real institutional workflows."',
      "}",
      "```",
    ].join("\n");

    const idea = normalizeIdeaContent(raw, frontier);
    expect(idea.title).toBe("Institutional Physics for Agentic AI");
    expect(idea.hypothesis).toContain("hidden institutional state");
    expect(idea.approach).toContain("shadow mode");
  });

  it("salvages truncated JSON-like idea responses", () => {
    const raw = `{ "title": "Cognitive Niche Construction in Agentic AI", "summary": "Agents learn from environments with hidden constraints.", "problemGap": "Current benchmarks miss real institutional adaptation.", "coreInsight": "Institutional motifs transfer across organizations.", "hypothesis": "Institutional motifs transfer across organizations.", "approach": "Begin in low-risk domains and scale conservatively`;

    const idea = normalizeIdeaContent(raw, frontier);
    expect(idea.title).toBe("Cognitive Niche Construction in Agentic AI");
    expect(idea.description).toContain("Current benchmarks miss real institutional adaptation");
    expect(isUsableIdeaResponse(raw, frontier)).toBe(true);
  });

  it("falls back to labeled text when JSON is missing", () => {
    const raw = `Research Title: Silent Systems\nAbstract: Study latent queues.\nScientific Gap: Opaque workflows hide state.\nCentral Insight: Institutions reveal themselves through delayed outcomes.\nCore Hypothesis: Hidden state is learnable.\nResearch Approach: Start in procurement.\nDecisive Experiment: Compare shadow-mode predictions against operator choices.`;

    const idea = normalizeIdeaContent(raw, frontier);
    expect(idea.title).toBe("Silent Systems");
    expect(idea.approach).toContain("procurement");
    expect(idea.decisiveTest).toContain("shadow-mode");
  });

  it("normalizes critique vote JSON wrapped in prose", () => {
    const map = new Map([
      ["gpt-5.4", "A"],
      ["gemini-3.1-pro-preview", "B"],
    ]);
    const raw = `Here is the result:\n\n\`\`\`json\n{\n  "critiques": [\n    {\n      "ideaLabel": "B",\n      "strengths": "Bold and specific.",\n      "weaknesses": "Needs tighter execution detail.",\n      "suggestions": "Clarify the deployment loop.",\n      "score": 8\n    }\n  ],\n  "rankings": [\n    { "label": "A", "rank": 1, "score": 9, "reasoning": "Best overall." },\n    { "label": "B", "rank": 2, "score": 8, "reasoning": "Strong but less complete." }\n  ]\n}\n\`\`\``;

    const parsed = normalizeCritiqueVoteResponse(raw, map);
    expect(parsed.critiques[0]?.targetModelId).toBe("gemini-3.1-pro-preview");
    expect(parsed.rankings).toHaveLength(2);
  });

  it("normalizes final vote rankings from fenced JSON", () => {
    const map = new Map([
      ["gpt-5.4", "A"],
      ["grok-4.20-beta", "B"],
    ]);
    const raw = "```json\n{\"rankings\":[{\"label\":\"B\",\"rank\":1,\"score\":9,\"reasoning\":\"More original.\"},{\"label\":\"A\",\"rank\":2,\"score\":8,\"reasoning\":\"Strong but less novel.\"}]}\n```";

    const rankings = normalizeFinalVoteResponse(raw, map);
    expect(rankings[0]).toMatchObject({ modelId: "grok-4.20-beta", rank: 1 });
    expect(rankings[1]).toMatchObject({ modelId: "gpt-5.4", rank: 2 });
  });
});
