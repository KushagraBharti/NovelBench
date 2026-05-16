import { getDefaultModels, getModelIdentityById } from "@/lib/models";
import { ModelCatalogEntry } from "@/types";

export interface ModelIdentity {
  id: string;
  name: string;
  provider: string;
  color: string;
  initial: string;
  personality: string;
}

export function getModelIdentity(modelId: string): ModelIdentity {
  const model = getModelIdentityById(modelId);
  return toIdentity(
    model ?? {
      id: modelId,
      openRouterId: modelId,
      name: modelId,
      provider: "OpenRouter",
      lab: "Unknown",
      tier: "experimental",
      tags: ["custom"],
      description: "Unknown model.",
      personality: "A mystery contender.",
      color: "#9b9590",
      initial: "?",
      defaultEnabled: false,
      active: true,
    }
  );
}

export function getModelOrder(modelIds?: string[]): string[] {
  if (!modelIds) {
    return getDefaultModels().map((model) => model.id);
  }
  return [...modelIds];
}

export const allModelIdentities = getDefaultModels().map(toIdentity);

function toIdentity(model: ModelCatalogEntry): ModelIdentity {
  return {
    id: model.id,
    name: model.name,
    provider: model.lab,
    color: model.color,
    initial: model.initial,
    personality: model.personality,
  };
}
