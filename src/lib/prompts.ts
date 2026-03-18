import { Critique, Idea } from "@/types";
import { getModelName } from "./models";

export function buildGeneratePrompt(
  categoryName: string,
  userPrompt: string
): string {
  return `You are participating in a creativity benchmark. Your task is to generate the most creative, novel, and well-thought-out response possible.

Category: ${categoryName}

Prompt: ${userPrompt}

Instructions:
- Be as creative and original as possible
- Provide a detailed, well-structured response
- Think outside the box and propose unique ideas
- Be specific and actionable, not vague
- Aim for novelty — avoid cliché or obvious approaches

Respond with your creative idea/proposal directly. Do not add meta-commentary about the task.`;
}

export function buildCritiquePrompt(
  ideaToReview: Idea,
  categoryName: string,
  originalPrompt: string
): string {
  const authorName = getModelName(ideaToReview.modelId);

  return `You are a creative expert judge in a benchmark evaluation. Your task is to critique the following idea and provide a score.

Category: ${categoryName}
Original Prompt: ${originalPrompt}

--- IDEA BY ${authorName} ---
${ideaToReview.content}
--- END IDEA ---

Provide your critique in the following format:

**Strengths:** (what makes this idea creative and valuable)

**Weaknesses:** (what could be improved, what's missing, what's unoriginal)

**Suggestions:** (specific ways to improve the idea)

**Score:** [X/10] (where 10 = exceptionally creative and novel, 1 = completely unoriginal)

Be fair, specific, and constructive. Judge based on creativity, novelty, feasibility, and depth.`;
}

export function buildRevisionPrompt(
  originalIdea: Idea,
  critiques: Critique[],
  categoryName: string,
  originalPrompt: string
): string {
  const critiqueText = critiques
    .map((c) => {
      const criticName = getModelName(c.fromModelId);
      return `--- Critique from ${criticName} (Score: ${c.score}/10) ---\n${c.content}\n`;
    })
    .join("\n");

  return `You are participating in a creativity benchmark. You previously submitted an idea that received critiques. Your task is to revise and improve your idea based on the feedback.

Category: ${categoryName}
Original Prompt: ${originalPrompt}

--- YOUR ORIGINAL IDEA ---
${originalIdea.content}
--- END ORIGINAL IDEA ---

--- CRITIQUES RECEIVED ---
${critiqueText}
--- END CRITIQUES ---

Instructions:
- Carefully consider all feedback
- Address the weaknesses identified
- Incorporate the best suggestions
- Maintain your original creative vision while improving
- Make the revised idea even more creative and novel
- Be specific and detailed

Respond with your revised idea directly. Do not add meta-commentary.`;
}

export function buildVotingPrompt(
  ideas: Idea[],
  categoryName: string,
  originalPrompt: string,
  round: "initial" | "revised"
): string {
  const ideasText = ideas
    .map((idea, i) => {
      const name = getModelName(idea.modelId);
      return `--- IDEA ${i + 1} by ${name} ---\n${idea.content}\n`;
    })
    .join("\n");

  return `You are a judge in a creativity benchmark. You must rank the following ${round === "revised" ? "revised " : ""}ideas from best to worst.

Category: ${categoryName}
Original Prompt: ${originalPrompt}

${ideasText}
--- END IDEAS ---

Rank ALL ${ideas.length} ideas from 1 (best) to ${ideas.length} (worst). For each, explain your reasoning briefly.

Respond in EXACTLY this JSON format (no other text):
{
  "rankings": [
    {"modelId": "<model-id>", "rank": 1, "reasoning": "<brief explanation>"},
    {"modelId": "<model-id>", "rank": 2, "reasoning": "<brief explanation>"},
    {"modelId": "<model-id>", "rank": 3, "reasoning": "<brief explanation>"},
    {"modelId": "<model-id>", "rank": 4, "reasoning": "<brief explanation>"}
  ]
}

The model IDs are: ${ideas.map((i) => i.modelId).join(", ")}

Judge based on: creativity, novelty, feasibility, depth, and overall quality.`;
}
