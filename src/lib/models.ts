import { ModelCatalogEntry } from "@/types";

export const MODEL_SELECTION_LIMITS = {
  min: 2,
  max: 8,
} as const;

const legacyModelAliases: Record<string, string> = {
  "gpt-5.4": "gpt-5.2-pro",
  "gpt-5.4-mini": "gpt-5-mini",
  "claude-sonnet-4.5": "claude-sonnet-4.6",
  "gemini-2.5-pro": "gemini-3.1-pro-preview",
  "gemini-2.5-flash": "gemini-3.1-flash-lite-preview",
  "gemini-3-flash": "gemini-3.1-flash-lite-preview",
  "grok-4.1-fast": "grok-4-fast",
  "kimi-k2": "kimi-k2.5",
  "mistral-large": "mistral-medium-3.1",
  "ministral-8b": "mistral-small-3.2-24b-instruct-2506",
};

const curatedCatalog: ModelCatalogEntry[] = [
  {
    id: "gpt-5.4",
    openRouterId: "openai/gpt-5.4",
    name: "GPT-5.4",
    provider: "OpenRouter",
    lab: "OpenAI",
    tier: "flagship",
    tags: ["reasoning", "general", "frontier"],
    description: "OpenAI's current top-end GPT-5.4-tier frontier model on OpenRouter.",
    personality: "The tactician. Methodical, broad, and usually difficult to rattle.",
    color: "#879cb3",
    initial: "G2",
    defaultEnabled: true,
    active: true,
  },
  {
    id: "gpt-5.4-mini",
    openRouterId: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "OpenRouter",
    lab: "OpenAI",
    tier: "mini",
    tags: ["fast", "general", "budget"],
    description: "Current lightweight GPT-5.4 variant for faster, cheaper iteration.",
    personality: "The overachiever. Small frame, very little hesitation.",
    color: "#7b93a8",
    initial: "Gm",
    defaultEnabled: false,
    active: true,
  },
  {
    id: "claude-opus-4.6",
    openRouterId: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "OpenRouter",
    lab: "Anthropic",
    tier: "flagship",
    tags: ["reasoning", "writing", "analysis"],
    description: "Anthropic's strongest current flagship model for complex, long-horizon work.",
    personality: "The closer. Expensive, deliberate, and built for hard problems.",
    color: "#8f82b8",
    initial: "Co",
    defaultEnabled: true,
    active: true,
  },
  {
    id: "claude-sonnet-4.6",
    openRouterId: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "OpenRouter",
    lab: "Anthropic",
    tier: "flagship",
    tags: ["reasoning", "writing", "analysis"],
    description: "Anthropic's newest Sonnet-class model with stronger coding and agentic performance.",
    personality: "The editor. Refined, careful, and annoyingly articulate.",
    color: "#a190b8",
    initial: "Cs",
    defaultEnabled: false,
    active: true,
  },
  {
    id: "claude-haiku-4.5",
    openRouterId: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "OpenRouter",
    lab: "Anthropic",
    tier: "fast",
    tags: ["fast", "writing", "analysis"],
    description: "Anthropic's latest Haiku-class model, optimized for fast, lower-cost inference.",
    personality: "The poet. Fast on its feet and rarely boring.",
    color: "#9b8eb8",
    initial: "Ch",
    defaultEnabled: false,
    active: true,
  },
  {
    id: "gemini-3.1-pro-preview",
    openRouterId: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "OpenRouter",
    lab: "Google DeepMind",
    tier: "flagship",
    tags: ["reasoning", "multimodal", "analysis"],
    description: "Google's latest verifiable frontier Pro model on OpenRouter, with 3.1-series upgrades.",
    personality: "The systems thinker. Sees structure everywhere.",
    color: "#7ba894",
    initial: "Gp",
    defaultEnabled: true,
    active: true,
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    openRouterId: "google/gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite Preview",
    provider: "OpenRouter",
    lab: "Google DeepMind",
    tier: "fast",
    tags: ["fast", "multimodal", "budget"],
    description: "Latest verifiable low-latency Gemini 3.1 text-capable Flash-family entry on OpenRouter.",
    personality: "The polymath. Rapid associations, low drag.",
    color: "#75b59c",
    initial: "Gf",
    defaultEnabled: false,
    active: true,
  },
  {
    id: "grok-4.20-beta",
    openRouterId: "x-ai/grok-4.20-beta",
    name: "Grok 4.20 Beta",
    provider: "OpenRouter",
    lab: "xAI",
    tier: "flagship",
    tags: ["reasoning", "frontier", "creative"],
    description: "Latest verifiable single-agent Grok flagship on OpenRouter.",
    personality: "The wildcard. Loves bold swings.",
    color: "#b8896b",
    initial: "G4",
    defaultEnabled: true,
    active: true,
  },
  {
    id: "x-ai/grok-4.1-fast",
    openRouterId: "x-ai/grok-4.1-fast",
    name: "Grok 4.1 Fast",
    provider: "OpenRouter",
    lab: "xAI",
    tier: "fast",
    tags: ["fast", "creative", "analysis"],
    description: "Fast Grok 4-family variant for lower-latency runs.",
    personality: "The sprinter. Often first, often loud.",
    color: "#b8896b",
    initial: "Gk",
    defaultEnabled: false,
    active: true,
  },
  {
    id: "deepseek-v3.2",
    openRouterId: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "OpenRouter",
    lab: "DeepSeek",
    tier: "reasoning",
    tags: ["reasoning", "open-weight", "frontier"],
    description: "DeepSeek's reasoning-specialized frontier model and the strongest verified DeepSeek catalog entry here.",
    personality: "The challenger. Efficient and surprisingly sharp.",
    color: "#4da1a9",
    initial: "Dr",
    defaultEnabled: false,
    active: true,
  },
  {
    id: "kimi-k2.5",
    openRouterId: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "OpenRouter",
    lab: "Moonshot AI",
    tier: "flagship",
    tags: ["reasoning", "long-context", "frontier"],
    description: "Moonshot's latest Kimi K2.5 release on OpenRouter.",
    personality: "The archivist. Likes large context and neat synthesis.",
    color: "#6d8fcb",
    initial: "K2",
    defaultEnabled: false,
    active: true,
  },
  {
    id: "glm-5.1",
    openRouterId: "z-ai/glm-5.1",
    name: "GLM 5.1",
    provider: "OpenRouter",
    lab: "Zhipu AI",
    tier: "flagship",
    tags: ["general", "analysis", "frontier"],
    description: "Latest verified flagship GLM-family model on OpenRouter.",
    personality: "The operator. Balanced, steady, unfussy.",
    color: "#7b6bc7",
    initial: "Gl",
    defaultEnabled: false,
    active: true,
  },
  {
    id: "glm-5-turbo",
    openRouterId: "z-ai/glm-5-turbo",
    name: "GLM 5 Turbo",
    provider: "OpenRouter",
    lab: "Zhipu AI",
    tier: "fast",
    tags: ["fast", "analysis", "agentic"],
    description: "Fast GLM 5-series option optimized for coding and tool-heavy agent work.",
    personality: "The operator's deputy. Leaner, quicker, still composed.",
    color: "#8877d6",
    initial: "Gf",
    defaultEnabled: false,
    active: true,
  },
];

export function getModelCatalog(): ModelCatalogEntry[] {
  return curatedCatalog
    .filter((model) => model.active)
    .map((model) => ({ supportsToolCalling: true, ...model }));
}

export function getDefaultModels(): ModelCatalogEntry[] {
  return getModelCatalog().filter((model) => model.defaultEnabled);
}

export function getModelById(id: string): ModelCatalogEntry | undefined {
  const direct = getModelCatalog().find((model) => model.id === id);
  if (direct) return direct;
  const alias = legacyModelAliases[id];
  return alias ? getModelCatalog().find((model) => model.id === alias) : undefined;
}

export function getModelByOpenRouterId(openRouterId: string): ModelCatalogEntry | undefined {
  return getModelCatalog().find((model) => model.openRouterId === openRouterId);
}

export function getModelName(id: string): string {
  return getModelById(id)?.name ?? id;
}

export function normalizeCustomModelId(modelId: string): string {
  return modelId.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9/_-]/g, "");
}

export function isValidOpenRouterModelId(modelId: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(modelId.trim());
}

export function createBringYourOwnModel(openRouterId: string): ModelCatalogEntry {
  const trimmed = openRouterId.trim();
  const fallbackId = normalizeCustomModelId(trimmed.replace("/", "-"));
  const label = trimmed.split("/").pop() ?? trimmed;

  return {
    id: `custom-${fallbackId}`,
    openRouterId: trimmed,
    name: label,
    provider: "OpenRouter",
    lab: trimmed.split("/")[0] ?? "Custom",
    tier: "experimental",
    tags: ["custom", "byom"],
    description: "User-supplied OpenRouter model.",
    personality: "An unknown contender.",
    color: "#8d8d8d",
    initial: label.slice(0, 2).toUpperCase(),
    defaultEnabled: false,
    active: true,
  };
}

function cloneModelEntry(model: ModelCatalogEntry, ordinal: number): ModelCatalogEntry {
  if (ordinal <= 1) return model;

  return {
    ...model,
    id: `${model.id}__${ordinal}`,
    name: `${model.name} ${ordinal}`,
    initial: model.initial,
    defaultEnabled: false,
  };
}

export function resolveSelectedModels(
  selectedModelIds: string[],
  customModelIds: string[] = []
): ModelCatalogEntry[] {
  const counts = new Map<string, number>();
  const selectedOpenRouterIds = new Set<string>();
  const resolved: ModelCatalogEntry[] = [];

  for (const id of selectedModelIds) {
    const model = getModelById(id);
    if (!model) continue;
    const ordinal = (counts.get(model.openRouterId) ?? 0) + 1;
    counts.set(model.openRouterId, ordinal);
    selectedOpenRouterIds.add(model.openRouterId.toLowerCase());
    resolved.push(cloneModelEntry(model, ordinal));
  }

  for (const id of customModelIds) {
    if (!isValidOpenRouterModelId(id)) continue;
    if (selectedOpenRouterIds.has(id.trim().toLowerCase())) continue;
    const model = createBringYourOwnModel(id);
    const ordinal = (counts.get(model.openRouterId) ?? 0) + 1;
    counts.set(model.openRouterId, ordinal);
    resolved.push(cloneModelEntry(model, ordinal));
  }

  return resolved;
}
