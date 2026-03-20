import { Category, CritiqueEntry, Idea, IdeaContent } from "@/types";
import { benchmarkPromptCopy } from "./prompt-copy";

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

export function buildGeneratePrompt(
  category: Category,
  userPrompt: string,
  options: { includeWebSearchInstructions?: boolean } = {}
): { system: string; user: string } {
  const jsonShape = buildIdeaJsonInstruction(category);
  const copy = benchmarkPromptCopy.generate;
  const instructionLines = [
    ...copy.instructions,
    ...(options.includeWebSearchInstructions ? copy.webSearchInstructions : []),
  ];

  const system = `${category.systemPrompt}

${copy.systemIntro}

Evaluation criteria for this category:
${category.evaluationCriteria.map((c) => `- ${c}`).join("\n")}`;

  const user = `Category: ${category.name}
Prompt: ${userPrompt}

Instructions:
${instructionLines.map((line) => `- ${line}`).join("\n")}

${copy.outputLeadIn}
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
  const ideasText = ideas
    .map((idea) => {
      const label = anonymousMap.get(idea.modelId)!;
      return `--- IDEA BY ANONYMOUS MODEL ${label} ---
${formatIdeaContent(idea.content, category)}
--- END IDEA ${label} ---`;
    })
    .join("\n\n");

  const critiqueJsonFields = ideas
    .map((idea) => {
      const label = anonymousMap.get(idea.modelId)!;
      return `    {
      "ideaLabel": "${label}",
      "strengths": "<what makes this idea creative and valuable>",
      "weaknesses": "<what's unoriginal, missing, or could be improved>",
      "suggestions": "<specific, actionable ways to improve the idea>",
      "score": <1-10>,
      "ranking": <position>
    }`;
    })
    .join(",\n");

  const copy = benchmarkPromptCopy.critique;

  const system = `${category.systemPrompt}

${copy.systemIntro}

Evaluation criteria for this category:
${category.evaluationCriteria.map((c) => `- ${c}`).join("\n")}

IMPORTANT — Scoring guidelines:
${copy.scoringGuidelines.map((line) => `- ${line}`).join("\n")}`;

  const user = `Category: ${category.name}
Original Prompt: ${originalPrompt}

${copy.reviewerIntro}

${ideasText}

YOUR TASK:
1. ${copy.taskLines[0]}
2. In each critique entry, include that idea's final ranking position among ALL ideas.
3. Critique, score, and rank all ${ideas.length} anonymous ideas.
4. Use each rank from 1 to ${ideas.length} exactly once across the full set of ideas.

Rules:
${copy.rules.map((line) => `- ${line}`).join("\n")}

${copy.outputLeadIn}
{
  "critiques": [
${critiqueJsonFields}
  ]
}`;

  return { system, user };
}

// --- Stage 3: Revision ---

export function buildRevisionPrompt(
  originalIdea: Idea,
  critiques: CritiqueEntry[],
  category: Category,
  originalPrompt: string,
  options: {
    includeWebSearchInstructions?: boolean;
    priorSourceSummary?: string;
  } = {}
): { system: string; user: string } {
  const jsonShape = buildIdeaJsonInstruction(category);
  const copy = benchmarkPromptCopy.revise;
  const instructionLines = [
    ...copy.instructions,
    ...(options.includeWebSearchInstructions ? copy.webSearchInstructions : []),
  ];

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

${copy.systemIntro}

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

${options.priorSourceSummary ? `--- PREVIOUSLY RETRIEVED SOURCES ---
${options.priorSourceSummary}
--- END PREVIOUS SOURCES ---

` : ""}Instructions:
${instructionLines.map((line) => `- ${line}`).join("\n")}

${copy.outputLeadIn}
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
  const copy = benchmarkPromptCopy.finalVote;
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
      return `    { "label": "${label}", "score": <1-10>, "rank": <position>, "reasoning": "<brief explanation>" }`;
    })
    .join(",\n");

  const system = `${category.systemPrompt}

${copy.systemIntro}

Evaluation criteria for this category:
${category.evaluationCriteria.map((c) => `- ${c}`).join("\n")}

IMPORTANT — Scoring guidelines:
${copy.scoringGuidelines.map((line) => `- ${line}`).join("\n")}`;

  const user = `Category: ${category.name}
Original Prompt: ${originalPrompt}

${copy.reviewerIntro}

${ideasText}

Rank ALL ${ideas.length} ideas from 1 (best) to ${ideas.length} (worst). Rate each 1-10.

Rules:
${copy.rules.map((line) => `- ${line}`).join("\n")}

${copy.outputLeadIn}
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
