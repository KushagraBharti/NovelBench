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
      '  "description": "A long structured proposal with real operational telemetry.",',
      '  "novelty": "Longitudinal institutional telemetry moat.",',
      '  "hypothesis": "Agents can model hidden institutional state.",',
      '  "methodology": "Deploy in shadow mode before bounded autonomy."',
      "}",
      "```",
    ].join("\n");

    const idea = normalizeIdeaContent(raw, frontier);
    expect(idea.title).toBe("Institutional Physics for Agentic AI");
    expect(idea.hypothesis).toContain("hidden institutional state");
  });

  it("salvages truncated JSON-like idea responses", () => {
    const raw = `{ "title": "Cognitive Niche Construction in Agentic AI", "summary": "Agents learn from environments with hidden constraints.", "description": "Build a research program around long-horizon adaptation in real institutions.", "novelty": "Moat from deployment traces.", "hypothesis": "Institutional motifs transfer across organizations.", "methodology": "Begin in low-risk domains and scale conservatively`;

    const idea = normalizeIdeaContent(raw, frontier);
    expect(idea.title).toBe("Cognitive Niche Construction in Agentic AI");
    expect(idea.description).toContain("real institutions");
    expect(isUsableIdeaResponse(raw, frontier)).toBe(true);
  });

  it("falls back to labeled text when JSON is missing", () => {
    const raw = `Research Title: Silent Systems\nAbstract: Study latent queues.\nFull Proposal: Observe delayed outcomes in opaque workflows.\nNovel Contribution: Introduces institution-aware agents.\nCore Hypothesis: Hidden state is learnable.\nApproach: Start in procurement.`;

    const idea = normalizeIdeaContent(raw, frontier);
    expect(idea.title).toBe("Silent Systems");
    expect(idea.methodology).toContain("procurement");
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
