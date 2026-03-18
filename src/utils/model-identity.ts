export interface ModelIdentity {
  id: string;
  name: string;
  provider: string;
  color: string;
  initial: string;
  personality: string;
}

export const modelIdentities: Record<string, ModelIdentity> = {
  "gpt-5.4-mini": {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "OpenAI",
    color: "#7B93A8",
    initial: "G",
    personality: "The overachiever. Never met a benchmark it didn't try to ace.",
  },
  "claude-haiku-4.5": {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    color: "#9B8EB8",
    initial: "C",
    personality: "The thoughtful poet. Finds depth where others see surface.",
  },
  "gemini-3-flash": {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "Google",
    color: "#7BA894",
    initial: "Ge",
    personality: "The polymath. Draws from everywhere, connects everything.",
  },
  "grok-4.1-fast": {
    id: "grok-4.1-fast",
    name: "Grok 4.1 Fast",
    provider: "xAI",
    color: "#B8896B",
    initial: "Gk",
    personality: "The wildcard. Unapologetically bold, always surprising.",
  },
};

export function getModelIdentity(modelId: string): ModelIdentity {
  return (
    modelIdentities[modelId] ?? {
      id: modelId,
      name: modelId,
      provider: "Unknown",
      color: "#9B9590",
      initial: "?",
      personality: "A mystery contender.",
    }
  );
}

export const modelOrder = [
  "gpt-5.4-mini",
  "claude-haiku-4.5",
  "gemini-3-flash",
  "grok-4.1-fast",
];

export const allModelIdentities = modelOrder.map((id) => modelIdentities[id]);
