import { Category, CritiqueEntry, Idea, IdeaContent } from "@/types";

// --- Helper to build the JSON schema instruction for idea generation ---

function buildIdeaJsonInstruction(category: Category): string {
  const fields = category.ideaSchema.map(
    (f) => `    "${f.key}": "<${f.description}>"`
  );
  return `{
${fields.join(",\n")}
}`;
}

// --- Stage 1: Generate ---

export function buildGeneratePrompt(category: Category, userPrompt: string): { system: string; user: string } {
  const jsonShape = buildIdeaJsonInstruction(category);

  const system = `${category.systemPrompt}

You are participating in a creativity benchmark. Your goal is to produce the most creative, novel, and well-thought-out response possible.

Evaluation criteria for this category:
${category.evaluationCriteria.map((c) => `- ${c}`).join("\n")}`;

  const user = `Category: ${category.name}
Prompt: ${userPrompt}

Instructions:
- Be as creative and original as possible
- Think outside the box and propose truly unique ideas
- Be specific and detailed, not vague or generic
- Aim for genuine novelty — avoid cliché or obvious approaches
- Every field should be substantive, not filler

Respond with ONLY valid JSON in this exact format (no other text):
${jsonShape}`;

  return { system, user };
}

// --- Stage 2: Combined Critique + Vote ---

export function buildCritiqueVotePrompt(
  ideas: Idea[],
  judgeModelId: string,
  category: Category,
  originalPrompt: string,
  anonymousMap: Map<string, string> // modelId -> "A", "B", "C", etc.
): { system: string; user: string } {
  // Show all ideas EXCEPT the judge's own
  const otherIdeas = ideas.filter((i) => i.modelId !== judgeModelId);
  // All ideas for ranking (including judge's own)
  const allIdeas = ideas;

  const ideasText = otherIdeas
    .map((idea) => {
      const label = anonymousMap.get(idea.modelId)!;
      return `--- IDEA BY ANONYMOUS MODEL ${label} ---
${formatIdeaContent(idea.content, category)}
--- END IDEA ${label} ---`;
    })
    .join("\n\n");

  const allIdeasList = allIdeas
    .map((idea) => {
      const label = anonymousMap.get(idea.modelId)!;
      return `Anonymous Model ${label}`;
    })
    .join(", ");

  const critiqueJsonFields = otherIdeas
    .map((idea) => {
      const label = anonymousMap.get(idea.modelId)!;
      return `    {
      "ideaLabel": "${label}",
      "strengths": "<what makes this idea creative and valuable>",
      "weaknesses": "<what's unoriginal, missing, or could be improved>",
      "suggestions": "<specific, actionable ways to improve the idea>",
      "score": <1-10>
    }`;
    })
    .join(",\n");

  const rankingJsonFields = allIdeas
    .map((idea) => {
      const label = anonymousMap.get(idea.modelId)!;
      return `    { "label": "${label}", "rank": <position>, "score": <1-10>, "reasoning": "<brief explanation>" }`;
    })
    .join(",\n");

  const system = `${category.systemPrompt}

You are an expert judge in a creativity benchmark. You must critique ideas from anonymous models and provide honest, well-calibrated evaluations.

Evaluation criteria for this category:
${category.evaluationCriteria.map((c) => `- ${c}`).join("\n")}

IMPORTANT — Scoring guidelines:
- Use the FULL 1-10 scale. Do not cluster scores in the 6-8 range.
- A score of 1-3 means the idea is generic, obvious, or poorly conceived.
- A score of 4-5 means it's competent but unremarkable — nothing you haven't seen before.
- A score of 6-7 means it's genuinely good with real creative merit.
- A score of 8-9 means it's exceptional — surprising, well-crafted, and memorable.
- A score of 10 is reserved for ideas that are truly brilliant and unlike anything you've seen.
- Be honest and decisive. If an idea is mediocre, say so. If it's great, say so. Don't hedge.
- Differentiate clearly between ideas. If one is significantly better, the scores should reflect that gap.`;

  const user = `Category: ${category.name}
Original Prompt: ${originalPrompt}

You are reviewing ideas from anonymous models. You do NOT know which model produced which idea. Judge purely on merit.

${ideasText}

YOUR TASK:
1. Critique each of the ideas above (not your own).
2. Rank ALL ideas (${allIdeasList}) — including your own (you are Anonymous Model ${anonymousMap.get(judgeModelId)}) — from best to worst.

Respond with ONLY valid JSON in this exact format (no other text):
{
  "critiques": [
${critiqueJsonFields}
  ],
  "rankings": [
${rankingJsonFields}
  ]
}`;

  return { system, user };
}

// --- Stage 3: Revision ---

export function buildRevisionPrompt(
  originalIdea: Idea,
  critiques: CritiqueEntry[],
  category: Category,
  originalPrompt: string
): { system: string; user: string } {
  const jsonShape = buildIdeaJsonInstruction(category);

  const critiqueText = critiques
    .map(
      (c, i) =>
        `--- Critique ${i + 1} (Score: ${c.score}/10) ---
Strengths: ${c.strengths}
Weaknesses: ${c.weaknesses}
Suggestions: ${c.suggestions}`
    )
    .join("\n\n");

  const system = `${category.systemPrompt}

You are participating in a creativity benchmark. You previously submitted an idea that received anonymous critiques. Your task is to revise and significantly improve your idea based on the feedback.

Evaluation criteria for this category:
${category.evaluationCriteria.map((c) => `- ${c}`).join("\n")}`;

  const user = `Category: ${category.name}
Original Prompt: ${originalPrompt}

--- YOUR ORIGINAL IDEA ---
${formatIdeaContent(originalIdea.content, category)}
--- END ORIGINAL IDEA ---

--- CRITIQUES RECEIVED ---
${critiqueText}
--- END CRITIQUES ---

Instructions:
- Carefully consider all feedback
- Address the weaknesses identified
- Incorporate the best suggestions
- Maintain your original creative vision while meaningfully improving
- Make the revised idea significantly more creative and novel
- Every field should be substantive and reflect the improvements

Respond with ONLY valid JSON in this exact format (no other text):
${jsonShape}`;

  return { system, user };
}

// --- Stage 4: Final Voting ---

export function buildFinalVotePrompt(
  ideas: Idea[],
  category: Category,
  originalPrompt: string,
  anonymousMap: Map<string, string>
): { system: string; user: string } {
  const ideasText = ideas
    .map((idea) => {
      const label = anonymousMap.get(idea.modelId)!;
      return `--- REVISED IDEA BY ANONYMOUS MODEL ${label} ---
${formatIdeaContent(idea.content, category)}
--- END IDEA ${label} ---`;
    })
    .join("\n\n");

  const rankingJsonFields = ideas
    .map((idea) => {
      const label = anonymousMap.get(idea.modelId)!;
      return `    { "label": "${label}", "rank": <position>, "score": <1-10>, "reasoning": "<brief explanation>" }`;
    })
    .join(",\n");

  const system = `${category.systemPrompt}

You are an expert judge in the final round of a creativity benchmark. These are revised ideas — they have already been critiqued and improved. Hold them to a higher standard.

Evaluation criteria for this category:
${category.evaluationCriteria.map((c) => `- ${c}`).join("\n")}

IMPORTANT — Scoring guidelines:
- Use the FULL 1-10 scale. Do not cluster scores in the 6-8 range.
- A score of 1-3 means the idea is generic, obvious, or poorly conceived.
- A score of 4-5 means it's competent but unremarkable.
- A score of 6-7 means it's genuinely good with real creative merit.
- A score of 8-9 means it's exceptional — surprising, well-crafted, and memorable.
- A score of 10 is reserved for truly brilliant ideas unlike anything you've seen.
- Be honest and decisive. Differentiate clearly between ideas.`;

  const user = `Category: ${category.name}
Original Prompt: ${originalPrompt}

These are REVISED ideas from anonymous models. Judge purely on merit.

${ideasText}

Rank ALL ${ideas.length} ideas from 1 (best) to ${ideas.length} (worst). Rate each 1-10.

Respond with ONLY valid JSON in this exact format (no other text):
{
  "rankings": [
${rankingJsonFields}
  ]
}`;

  return { system, user };
}

// --- Helpers ---

function formatIdeaContent(content: IdeaContent, category: Category): string {
  return category.ideaSchema
    .map((field) => `${field.label}: ${content[field.key] || "N/A"}`)
    .join("\n");
}
