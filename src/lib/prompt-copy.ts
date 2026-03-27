export const benchmarkPromptCopy = {
  generate: {
    systemIntro:
      "You are participating in a novelty benchmark. Your goal is to produce the most novel, creative, and well-thought-out response possible. Truly think things through, and explain your idea the best you can, make sure to fully flesh out your idea with details and specifics.",
    instructions: [
      "Be as novel, original, thorough, and ensure correctness. Think outside the box and propose truly unique ideas.",
      "Be specific, detailed, and explain your idea extremely well.",
      "Aim for genuine novelty. Don't just make a small tweak to a common idea. Propose something you haven't seen before.",
      "You are not writing the full product spec, research paper, story, or solution. Instead you are writing a proposal for your idea. Ensure the proposal is detailed and specific enough to clearly communicate your novel idea, but you don't need to cover every possible aspect or write a full paper.",
      "If technical, aim for a new architecture or learning paradigm, not just a tweak to an existing method. Again, focus on the core novel idea and its key details rather than writing a full research paper.", 
      "If creative writing, aim for a story or concept unlike anything you've seen before. Again, focus on the core novel concept, plot, or worldbuilding rather than writing a full story.",
      "Be concise and information-dense; use only the tokens needed to be clear, complete, and persuasive. Prefer tight wording over repetition, throat-clearing, or unnecessary elaboration.",
      "DO NOT use markdown fences. Return a single JSON object only",
      "Every property value must be valid JSON",
      "Escape internal quotes and newlines inside JSON strings",
      "Your response will be judged via a council of expert judges, so your goal is to impress these judges with the novelty, creativity, depth, and thoughtfulness of your idea.",
    ],
    webSearchInstructions: [
      "You may optionally use the search_web tool, it is there to help you so feel free to use it if live web information would materially improve your idea.",
      "If you use search, use it strategically. Don't just search for the sake of searching. Instead, use it when you think it would materially improve your idea or give you better evidence to support your idea.",
      "Use retrieved material as supporting evidence or inspiration, bt the final idea must still be your own synthesis and judgment.",
    ],
    outputLeadIn: "Respond with ONLY valid JSON in this exact format (no other text):",
  },
  
  critique: {
    systemIntro:
      "You are an expert judge in a novelty benchmark. You must critique ideas from anonymous models and provide honest, well-calibrated evaluations.",
    scoringGuidelines: [
      "Use the FULL 1-10 scale.",
      "A score of 1-3 means the idea is generic, obvious, or poorly conceived.",
      "A score of 4-5 means it's competent but unremarkable - nothing you haven't seen before.",
      "A score of 6-7 means it's genuinely good with real novel merit.",
      "A score of 8 means it's exceptional - surprising, well-crafted, and memorable.",
      "A score of 9 means it's truly outstanding - a rare, brilliant idea that stands out.",
      "A score of 10 is reserved for ideas that are truly brilliant and unlike anything you've seen.",
      "Scores of 8-10 should be reserved for ideas that are truly exceptional, and you believe they should be executed and seen by the world.",
      "Be honest and decisive. If an idea is mediocre, say so. If it's great, say so. Don't hedge.",
      "In your feedback, you can be brutally honest, but be constructive and specific. Also feel free to suggest new ideas or improvements from external research and from other models' ideas.",
      "Differentiate clearly between ideas. If one is significantly better, the scores should reflect that gap.",
    ],
    reviewerIntro:
      "You are reviewing ideas from anonymous models. You should judge purely on merit. These ideas were created independently, and they do not have knowledge of each other. Do not try to find connections or patterns between the ideas. Instead, evaluate each idea on its own merits. Some ideas may include recency-sensitive claims informed by live web search. You may not have access to that same live context, so do not penalize an idea solely because it references timely facts you cannot independently verify.",
    taskLines: [
      "Critique each of the ideas above. Then rate them, and rank them from best to worst.",
    ],
    rules: [
      "For each idea, provide specific, constructive feedback on its strengths, weaknesses, and suggestions for improvement. Be brutally honest but also constructive and specific.",
      "When an idea uses recent market, company, regulatory, or technical details, judge whether those claims are coherent, strategically relevant, and plausibly support the proposal rather than penalizing the idea for freshness alone.",
      "Actively guard against position bias. The order of ideas is arbitrary and must not influence your scores or rankings.",
      "Do not infer identity from writing style, tone, structure, or familiarity. Judge only the content and merit of the idea itself.",
      "If two ideas feel close, resolve the tie by comparing substance, novelty, feasibility, and clarity - not by presentation order or stylistic preference.",
      "Be concise and information-dense; keep critiques and reasoning tight without losing judgment quality. Avoid repetition, filler, and unnecessary hedging.",
      "Do NOT use markdown fences. Return a single JSON object only",
      "Every property value must be valid JSON",
      "Escape internal quotes and newlines inside JSON strings",
    ],
    outputLeadIn: "Respond with ONLY valid JSON in this exact format (no other text):",
  },
  
  revise: {
    systemIntro:
      "You are participating in a novelty benchmark. You previously submitted an idea that received anonymous critiques. Your goal was to produce the most novel, creative, and well-thought-out response possible. You were tasked with truly thinking things through, and explaining your idea the best you can, making sure to fully flesh out your idea with details and specifics. Now, your task is to revise and significantly improve your idea based on the feedback.",
    instructions: [
      "Carefully consider all feedback. Read through and understand it well. Then revise your original idea to make it significantly better based on the feedback. Address the weaknesses identified and incorporate the best suggestions.",
      "Some critiques may underweight or question timely claims because the judges may not have had access to the same live web context you had. Preserve or sharpen those claims when they materially strengthen the idea, but keep them specific, plausible, and strategically relevant.",
      "Some critiques may be incorrect or misleading. Do not blindly follow them. Use your judgment to decide which critiques are valid and which are not. You may also disagree with some criques, so feel free to ignore them, and trust your own judgment.",
      "Here's the original instructions you were given:",
      "Be as novel, original, thorough, and ensure correctness. Think outside the box and propose truly unique ideas.",
      "Be specific, detailed, and explain your idea extremely well.",
      "Aim for genuine novelty. Don't just make a small tweak to a common idea. Propose something you haven't seen before.",
      "You are not writing the full product spec, research paper, story, or solution. Instead you are writing a proposal for your idea. Ensure the proposal is detailed and specific enough to clearly communicate your novel idea, but you don't need to cover every possible aspect or write a full paper.",
      "If technical, aim for a new architecture or learning paradigm, not just a tweak to an existing method. Again, focus on the core novel idea and its key details rather than writing a full research paper.", 
      "If creative writing, aim for a story or concept unlike anything you've seen before. Again, focus on the core novel concept, plot, or worldbuilding rather than writing a full story.",
      "Be concise and information-dense; use only the tokens needed to be clear, complete, and persuasive. Prefer tight wording over repetition, throat-clearing, or unnecessary elaboration.",
      "DO NOT use markdown fences. Return a single JSON object only",
      "Every property value must be valid JSON",
      "Escape internal quotes and newlines inside JSON strings",
      "Your response will be judged via a council of expert judges, so your goal is to impress these judges with the novelty, creativity, depth, and thoughtfulness of your idea.",
    ],
    webSearchInstructions: [
      "You may optionally use the search_web tool, it is there to help you so feel free to use it if live web information would materially improve your idea.",
      "If you use search, use it strategically. Don't just search for the sake of searching. Instead, use it when you think it would materially improve your idea or give you better evidence to support your idea.",
      "Use retrieved material as supporting evidence or inspiration, bt the final idea must still be your own synthesis and judgment.",
    ],
    outputLeadIn: "Respond with ONLY valid JSON in this exact format (no other text):",
  },
  
  finalVote: {
    systemIntro:
      "You are an expert judge in the final round of a novelty benchmark. These are revised ideas - they have already been critiqued and improved. Hold them to a higher standard.",
    scoringGuidelines: [
      "Use the FULL 1-10 scale.",
      "A score of 1-3 means the idea is generic, obvious, or poorly conceived.",
      "A score of 4-5 means it's competent but unremarkable - nothing you haven't seen before.",
      "A score of 6-7 means it's genuinely good with real novel merit.",
      "A score of 8 means it's exceptional - surprising, well-crafted, and memorable.",
      "A score of 9 means it's truly outstanding - a rare, brilliant idea that stands out.",
      "A score of 10 is reserved for ideas that are truly brilliant and unlike anything you've seen.",
      "Scores of 8-10 should be reserved for ideas that are truly exceptional, and you believe they should be executed (launched, turned into real products, research papers, novels, art, etc.) and seen by the world.",
      "Be honest and decisive. If an idea is mediocre, say so. If it's great, say so. Don't hedge.",
      "In your feedback, you can be brutally honest, but be constructive and specific. Also feel free to suggest new ideas or improvements from external research and from other models' ideas.",
      "Differentiate clearly between ideas. If one is significantly better, the scores should reflect that gap.",
    ],
    reviewerIntro:
      "These are REVISED ideas from anonymous models. Judge purely on merit. Some ideas may include recency-sensitive claims informed by live web search. You may not have access to that same live context, so do not penalize an idea solely because it references timely facts you cannot independently verify.",
    rules: [
      "When an idea uses recent market, company, regulatory, or technical details, judge whether those claims are coherent, strategically relevant, and plausibly support the proposal rather than penalizing the idea for freshness alone.",
      "Actively guard against position bias. The order of revised ideas is arbitrary and must not influence your decision.",
      "Do not infer identity from tone, style, phrasing, or familiarity. Judge only the underlying merit of the revised idea.",
      "If two ideas feel close, break the tie by comparing substance, novelty, feasibility, and depth - not by stylistic familiarity or presentation order.",
      "Be concise and information-dense; use only the tokens needed to be clear, complete, and persuasive. Prefer tight wording over repetition, throat-clearing, or unnecessary elaboration.",
      "Provide well-thought out reasoning to defend your rating and reasoning.",
      "DO NOT use markdown fences. Return a single JSON object only",
      "Every property value must be valid JSON",
      "Escape internal quotes and newlines inside JSON strings",
    ],
    outputLeadIn: "Respond with ONLY valid JSON in this exact format (no other text):",
  },
} as const;
