import { Model } from "@/types";

export const models: Model[] = [
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "OpenAI",
    openRouterId: "openai/gpt-5.4-mini",
  },
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    openRouterId: "anthropic/claude-haiku-4.5",
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "Google",
    openRouterId: "google/gemini-3-flash-preview",
  },
  {
    id: "grok-4.1-fast",
    name: "Grok 4.1 Fast",
    provider: "xAI",
    openRouterId: "x-ai/grok-4.1-fast",
  },
];

export function getModelById(id: string): Model | undefined {
  return models.find((m) => m.id === id);
}

export function getModelName(id: string): string {
  return getModelById(id)?.name ?? id;
}

export function getAllModels(): Model[] {
  return models;
}
