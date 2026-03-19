import { BenchmarkRun, CritiqueEntry, Idea, ModelCatalogEntry, RunCheckpointStage } from "@/types";
import { getCategoryById } from "./categories";
import { buildChatCompletionBody, ChatMessage, ReasoningConfig } from "./openrouter";
import {
  JSON_RETRY_MESSAGE,
  REASONING_CRITIQUE,
  REASONING_GENERATE,
  REASONING_REVISE,
  REASONING_VOTE,
} from "./prompt-runtime";
import {
  buildCritiqueVotePrompt,
  buildFinalVotePrompt,
  buildGeneratePrompt,
  buildRevisionPrompt,
} from "./prompts";

const ANONYMOUS_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

type PromptStage = "generate" | "critique" | "revise" | "vote";

export interface PromptReviewEntry {
  stage: PromptStage;
  modelId: string;
  modelName: string;
  openRouterId: string;
  reasoning: unknown;
  stream: boolean;
  messages: ChatMessage[];
  requestBody: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  anonymousModel?: string;
  notes: string[];
}

export interface PromptReviewResponse {
  runId: string;
  categoryId: string;
  categoryName: string;
  originalPrompt: string;
  promptSources: {
    categorySystemPrompt: string;
    evaluationCriteria: string[];
    ideaSchema: { key: string; label: string; description: string }[];
  };
  notes: string[];
  retryPrompt: {
    usedForStages: PromptStage[];
    message: string;
    caveat: string;
  };
  entries: PromptReviewEntry[];
}

function buildAnonymousMap(modelIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  modelIds.forEach((id, index) => map.set(id, ANONYMOUS_LABELS[index]));
  return map;
}

function shuffleArray<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }

  function nextRand(): number {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function getEarliestFailureStage(run: BenchmarkRun, modelId: string): RunCheckpointStage | null {
  const orderedStages: RunCheckpointStage[] = ["generate", "critique", "human_critique", "revise", "vote", "complete"];
  const failedStages = run.failures
    .filter((failure) => failure.modelId === modelId)
    .map((failure) => failure.stage);

  if (failedStages.length === 0) return null;

  failedStages.sort((a, b) => orderedStages.indexOf(a) - orderedStages.indexOf(b));
  return failedStages[0] ?? null;
}

function modelFailedBeforeStage(run: BenchmarkRun, modelId: string, stage: PromptStage): boolean {
  const failureStage = getEarliestFailureStage(run, modelId);
  if (!failureStage) return false;

  const order: PromptStage[] = ["generate", "critique", "revise", "vote"];
  const stageIndex = order.indexOf(stage);
  const failureIndex = order.indexOf(failureStage as PromptStage);
  return failureIndex !== -1 && failureIndex < stageIndex;
}

function getModel(run: BenchmarkRun, modelId: string): ModelCatalogEntry {
  const model = run.selectedModels.find((entry) => entry.id === modelId);
  if (!model) {
    throw new Error(`Model not found in run: ${modelId}`);
  }
  return model;
}

function buildEntry(
  stage: PromptStage,
  model: ModelCatalogEntry,
  messages: ChatMessage[],
  reasoning: ReasoningConfig,
  stream: boolean,
  notes: string[],
  anonymousModel?: string
): PromptReviewEntry {
  return {
    stage,
    modelId: model.id,
    modelName: model.name,
    openRouterId: model.openRouterId,
    reasoning,
    stream,
    messages,
    requestBody: buildChatCompletionBody(model.openRouterId, messages, { reasoning, stream }),
    systemPrompt: messages[0]?.content ?? "",
    userPrompt: messages[1]?.content ?? "",
    anonymousModel,
    notes,
  };
}

function critiquesForIdea(run: BenchmarkRun, modelId: string): CritiqueEntry[] {
  const critiques: CritiqueEntry[] = [];

  for (const vote of run.critiqueVotes) {
    for (const critique of vote.critiques) {
      if (critique.targetModelId === modelId) {
        critiques.push(critique);
      }
    }
  }

  for (const critique of run.humanCritiques) {
    if (critique.targetModelId === modelId) {
      critiques.push(critique);
    }
  }

  return critiques;
}

export function buildPromptReview(run: BenchmarkRun): PromptReviewResponse {
  const category = getCategoryById(run.categoryId);
  if (!category) {
    throw new Error(`Unknown category: ${run.categoryId}`);
  }

  const entries: PromptReviewEntry[] = [];
  const generatePrompt = buildGeneratePrompt(category, run.prompt);

  for (const model of run.selectedModels) {
    const messages: ChatMessage[] = [
      { role: "system", content: generatePrompt.system },
      { role: "user", content: generatePrompt.user },
    ];
    entries.push(
      buildEntry(
        "generate",
        model,
        messages,
        REASONING_GENERATE,
        true,
        [
          "Generation is streamed token-by-token.",
          "If streaming fails after partial output, the partial text may still be accepted and normalized instead of retried.",
          "The app does not persist the outbound prompt payload; this view reconstructs it deterministically from code and run data.",
        ]
      )
    );
  }

  const critiqueIdeas = run.ideas.filter((idea) => !modelFailedBeforeStage(run, idea.modelId, "critique"));
  const critiqueAnonymousMap = buildAnonymousMap(critiqueIdeas.map((idea) => idea.modelId));

  for (const idea of critiqueIdeas) {
    const model = getModel(run, idea.modelId);
    const shuffledIdeas = shuffleArray(critiqueIdeas, `critique_${idea.modelId}_${run.id}`);
    const prompt = buildCritiqueVotePrompt(
      shuffledIdeas,
      idea.modelId,
      category,
      run.prompt,
      critiqueAnonymousMap
    );
    const messages: ChatMessage[] = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ];
    entries.push(
      buildEntry(
        "critique",
        model,
        messages,
        REASONING_CRITIQUE,
        false,
        [
          "Critique is a non-streaming request.",
          "If the response is not parseable JSON, the app may send one extra repair turn with the model's invalid output as an assistant message plus the JSON retry instruction.",
          "Anonymous labels are stable for the stage, but idea presentation order is deterministically shuffled per judge.",
        ],
        critiqueAnonymousMap.get(idea.modelId)
      )
    );
  }

  const revisionIdeas = run.ideas.filter((idea) => !modelFailedBeforeStage(run, idea.modelId, "revise"));

  for (const idea of revisionIdeas) {
    const model = getModel(run, idea.modelId);
    const prompt = buildRevisionPrompt(idea, critiquesForIdea(run, idea.modelId), category, run.prompt);
    const messages: ChatMessage[] = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ];
    entries.push(
      buildEntry(
        "revise",
        model,
        messages,
        REASONING_REVISE,
        true,
        [
          "Revision is streamed token-by-token.",
          "As in generation, partial streamed output may be accepted and normalized instead of retried.",
          "Revision prompts include all successful model critiques plus any saved human critiques targeting that model.",
        ]
      )
    );
  }

  const voteIdeas = run.revisedIdeas.filter((idea) => !modelFailedBeforeStage(run, idea.modelId, "vote"));
  const voteAnonymousMap = buildAnonymousMap(voteIdeas.map((idea) => idea.modelId));

  for (const idea of voteIdeas) {
    const model = getModel(run, idea.modelId);
    const shuffledIdeas = shuffleArray(voteIdeas, `vote_${idea.modelId}_${run.id}`);
    const prompt = buildFinalVotePrompt(shuffledIdeas, category, run.prompt, voteAnonymousMap);
    const messages: ChatMessage[] = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ];
    entries.push(
      buildEntry(
        "vote",
        model,
        messages,
        REASONING_VOTE,
        false,
        [
          "Final voting is a non-streaming request.",
          "As in critique, the app may send one extra repair turn if the ranking response is not parseable JSON.",
          "Anonymous labels are stable for the stage, but revised idea order is deterministically shuffled per judge.",
        ],
        voteAnonymousMap.get(idea.modelId)
      )
    );
  }

  return {
    runId: run.id,
    categoryId: category.id,
    categoryName: category.name,
    originalPrompt: run.prompt,
    promptSources: {
      categorySystemPrompt: category.systemPrompt,
      evaluationCriteria: category.evaluationCriteria,
      ideaSchema: category.ideaSchema,
    },
    notes: [
      "This review includes every initial prompt shape used by the benchmark pipeline for this run.",
      "The app stores raw model outputs, but it does not store outbound prompts verbatim.",
      "Initial prompts are reconstructed exactly from the code path that produced them.",
      "Conditional retry turns for invalid JSON are shown as a shared retry prompt because the app does not store whether that branch fired for a specific critique/vote response.",
    ],
    retryPrompt: {
      usedForStages: ["critique", "vote"],
      message: JSON_RETRY_MESSAGE,
      caveat:
        "This retry turn is only sent when the first critique/vote response fails JSON validation. The current app does not persist enough data to prove whether it happened for a given request.",
    },
    entries,
  };
}
