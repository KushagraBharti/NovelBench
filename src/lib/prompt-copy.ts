export const benchmarkPromptCopy = {
  generate: {
    systemIntro:
      "You are participating in a creativity benchmark. Your goal is to produce the most creative, novel, and well-thought-out response possible.",
    instructions: [
      "Be as creative and original as possible",
      "Think outside the box and propose truly unique ideas",
      "Be specific and detailed, not vague or generic",
      "Aim for genuine novelty - avoid cliché or obvious approaches",
      "Every field should be substantive, not filler",
      "Be concise and information-dense; use only the tokens needed to be clear, complete, and persuasive",
      "Prefer tight wording over repetition, throat-clearing, or unnecessary elaboration",
      "Return a single JSON object only",
      "Do NOT use markdown fences",
      "Every property value must be valid JSON",
      "Escape internal quotes and newlines inside JSON strings",
    ],
    outputLeadIn: "Respond with ONLY valid JSON in this exact format (no other text):",
  },
  critique: {
    systemIntro:
      "You are an expert judge in a creativity benchmark. You must critique ideas from anonymous models and provide honest, well-calibrated evaluations.",
    scoringGuidelines: [
      "Use the FULL 1-10 scale. Do not cluster scores in the 6-8 range.",
      "A score of 1-3 means the idea is generic, obvious, or poorly conceived.",
      "A score of 4-5 means it's competent but unremarkable - nothing you haven't seen before.",
      "A score of 6-7 means it's genuinely good with real creative merit.",
      "A score of 8-9 means it's exceptional - surprising, well-crafted, and memorable.",
      "A score of 10 is reserved for ideas that are truly brilliant and unlike anything you've seen.",
      "Be honest and decisive. If an idea is mediocre, say so. If it's great, say so. Don't hedge.",
      "Differentiate clearly between ideas. If one is significantly better, the scores should reflect that gap.",
    ],
    reviewerIntro:
      "You are reviewing ideas from anonymous models. You do NOT know which model produced which idea. Judge purely on merit.",
    taskLines: [
      "Critique each of the ideas above (not your own).",
      "Rank ALL ideas - including your own - from best to worst.",
    ],
    rules: [
      "Be concise and information-dense; keep critiques and reasoning tight without losing judgment quality",
      "Avoid repetition, filler, and unnecessary hedging",
      "Return a single JSON object only",
      "Do NOT use markdown fences",
      "Every property value must be valid JSON",
      "Escape internal quotes and newlines inside JSON strings",
    ],
    outputLeadIn: "Respond with ONLY valid JSON in this exact format (no other text):",
  },
  revise: {
    systemIntro:
      "You are participating in a creativity benchmark. You previously submitted an idea that received anonymous critiques. Your task is to revise and significantly improve your idea based on the feedback.",
    instructions: [
      "Carefully consider all feedback",
      "Address the weaknesses identified",
      "Incorporate the best suggestions",
      "Maintain your original creative vision while meaningfully improving",
      "Make the revised idea significantly more creative and novel",
      "Every field should be substantive and reflect the improvements",
      "Be concise and information-dense; use only the tokens needed to deliver a strong revision",
      "Prefer tight wording over repetition, throat-clearing, or unnecessary elaboration",
      "Return a single JSON object only",
      "Do NOT use markdown fences",
      "Every property value must be valid JSON",
      "Escape internal quotes and newlines inside JSON strings",
    ],
    outputLeadIn: "Respond with ONLY valid JSON in this exact format (no other text):",
  },
  finalVote: {
    systemIntro:
      "You are an expert judge in the final round of a creativity benchmark. These are revised ideas - they have already been critiqued and improved. Hold them to a higher standard.",
    scoringGuidelines: [
      "Use the FULL 1-10 scale. Do not cluster scores in the 6-8 range.",
      "A score of 1-3 means the idea is generic, obvious, or poorly conceived.",
      "A score of 4-5 means it's competent but unremarkable.",
      "A score of 6-7 means it's genuinely good with real creative merit.",
      "A score of 8-9 means it's exceptional - surprising, well-crafted, and memorable.",
      "A score of 10 is reserved for truly brilliant ideas unlike anything you've seen.",
      "Be honest and decisive. Differentiate clearly between ideas.",
    ],
    reviewerIntro:
      "These are REVISED ideas from anonymous models. Judge purely on merit.",
    rules: [
      "Be concise and information-dense; keep reasoning short but specific",
      "Avoid repetition, filler, and unnecessary hedging",
      "Return a single JSON object only",
      "Do NOT use markdown fences",
      "Every property value must be valid JSON",
      "Escape internal quotes and newlines inside JSON strings",
    ],
    outputLeadIn: "Respond with ONLY valid JSON in this exact format (no other text):",
  },
} as const;
