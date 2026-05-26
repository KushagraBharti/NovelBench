import type {
  BenchmarkControlState,
  BenchmarkRun,
  BenchmarkRunSummary,
  ControlActionRecord,
  CritiqueVoteResult,
  HumanCritiqueEntry,
  ModelControlState,
  ModelRunState,
  Ranking,
  RunCheckpoint,
  RunFailureRecord,
  StageWebTrace,
  ReasoningDetailRecord,
} from "@/types";
import { DEFAULT_WEB_SEARCH_CONFIG, mergeStageWebTraces } from "@/lib/benchmark-web";
import type { Doc, Id } from "../_generated/dataModel";

function toIso(timestamp?: number) {
  return new Date(timestamp ?? Date.now()).toISOString();
}

function uniqueModelIds(values: string[]) {
  return Array.from(new Set(values));
}

export type CompactRunDocs = {
  humanCritiques: Doc<"runHumanCritiques">[];
  sources: Doc<"runSources">[];
  failures: Doc<"runFailures">[];
  controls: Doc<"runControlEvents">[];
  reasoningSummaries: Doc<"runReasoningSummaries">[];
};

type ReasoningEventLike = {
  _id?: unknown;
  stage: "generate" | "revise" | string;
  kind: string;
  participantModelId?: string;
  payload?: unknown;
  createdAt: number;
};

function completedModelIdsForStage(
  stage: BenchmarkRun["checkpoint"]["stage"],
  participants: Doc<"runParticipants">[],
) {
  switch (stage) {
    case "generate":
      return uniqueModelIds(
        participants.filter((participant) => participant.generatedIdea).map((participant) => participant.modelId),
      );
    case "critique":
    case "human_critique":
      return uniqueModelIds(
        participants.filter((participant) => participant.critiqueResult).map((participant) => participant.modelId),
      );
    case "revise":
      return uniqueModelIds(
        participants.filter((participant) => participant.revisedIdea).map((participant) => participant.modelId),
      );
    case "vote":
    case "complete":
      return uniqueModelIds(
        participants.filter((participant) => participant.finalRanking).map((participant) => participant.modelId),
      );
    default:
      return [];
  }
}

function controlHistoryFromDocs(events: Doc<"runControlEvents">[]): ControlActionRecord[] {
  return events
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((event) => ({
      id: `${event._id}`,
      scope: event.scope,
      action: event.action,
      timestamp: toIso(event.createdAt),
      actor: event.actor,
      stage: event.stage,
      modelId: event.participantModelId,
      reason: event.reason,
    }));
}

function defaultModelControls(participants: Doc<"runParticipants">[]) {
  const controls: Record<string, ModelControlState> = {};
  for (const participant of participants) {
    controls[participant.modelId] = {
      modelId: participant.modelId,
      isPaused: participant.status === "paused",
      isCanceled: participant.status === "canceled",
    };
  }
  return controls;
}

function deriveCheckpoint(
  run: Doc<"runs">,
  participants: Doc<"runParticipants">[],
): RunCheckpoint {
  const completedModelIds = completedModelIdsForStage(run.checkpointStage, participants);
  const readyForRevisionModelIds =
    run.checkpointStage === "human_critique"
      ? uniqueModelIds(
          participants
            .filter(
              (participant) =>
                participant.critiqueResult &&
                participant.status !== "failed" &&
                participant.status !== "canceled",
            )
            .map((participant) => participant.modelId),
        )
      : [];

  return {
    stage: run.checkpointStage,
    completedModelIds,
    readyForRevisionModelIds,
    updatedAt: toIso(run.updatedAt),
  };
}

function mapFailuresFromDocs(failures: Doc<"runFailures">[]): RunFailureRecord[] {
  return failures
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((failure) => ({
      id: failure.sourceEventId ?? `${failure._id}`,
      stage: failure.stage,
      modelId: failure.participantModelId,
      message: failure.message,
      retryable: failure.retryable,
      timestamp: toIso(failure.createdAt),
    }));
}

function mapIdeas(
  participants: Doc<"runParticipants">[],
  field: "generatedIdea" | "revisedIdea",
) {
  return participants
    .filter((participant) => participant[field])
    .sort((a, b) => a.order - b.order)
    .map((participant) => ({
      modelId: participant.modelId,
      content: participant[field] as BenchmarkRun["ideas"][number]["content"],
      raw: "",
      timestamp: toIso(participant.completedAt ?? participant._creationTime),
    }));
}

function mapCritiqueVotes(participants: Doc<"runParticipants">[]): CritiqueVoteResult[] {
  return participants
    .filter((participant) => participant.critiqueResult)
    .sort((a, b) => a.order - b.order)
    .map((participant) => participant.critiqueResult as CritiqueVoteResult);
}

function mapRankings(participants: Doc<"runParticipants">[]): Ranking[] {
  return participants
    .filter((participant) => participant.finalRanking)
    .sort((a, b) => a.order - b.order)
    .map((participant) => participant.finalRanking as Ranking);
}

function mapHumanCritiquesFromDocs(critiques: Doc<"runHumanCritiques">[]): HumanCritiqueEntry[] {
  return critiques
    .slice()
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
    })
    .map((critique) => ({
      id: critique.critiqueId,
      ideaLabel: critique.ideaLabel,
      targetModelId: critique.targetModelId,
      strengths: critique.strengths,
      weaknesses: critique.weaknesses,
      suggestions: critique.suggestions,
      score: critique.score,
      authorLabel: critique.authorLabel,
      timestamp: toIso(critique.createdAt),
    }));
}

function mapWebStateFromSources(sources: Doc<"runSources">[]) {
  return mergeStageWebTraces(
    sources.map((source) => ({
      stage: source.stage,
      modelId: source.participantModelId,
      toolCalls: source.toolCalls as StageWebTrace["toolCalls"],
      retrievedSources: source.retrievedSources as StageWebTrace["retrievedSources"],
      usage: source.usage as StageWebTrace["usage"],
    })),
    DEFAULT_WEB_SEARCH_CONFIG,
  );
}

function mergeReasoningDetailRecords(
  target: Map<string, ReasoningDetailRecord>,
  stage: "generate" | "revise",
  modelId: string,
  payload: {
    detailId?: string;
    detailType: ReasoningDetailRecord["type"];
    format?: string;
    index?: number;
    text?: string;
    summary?: string;
    data?: string;
    signature?: string | null;
    turn?: number;
  },
  createdAt: number,
) {
  const detailId = payload.detailId ?? `${stage}:${modelId}:${payload.detailType}:${payload.index ?? 0}`;
  const existing = target.get(detailId);
  target.set(detailId, {
    id: detailId,
    stage,
    modelId,
    turn: payload.turn,
    type: payload.detailType,
    format: payload.format ?? existing?.format,
    index: payload.index ?? existing?.index,
    text: `${existing?.text ?? ""}${payload.text ?? ""}` || undefined,
    summary: `${existing?.summary ?? ""}${payload.summary ?? ""}` || undefined,
    data: `${existing?.data ?? ""}${payload.data ?? ""}` || undefined,
    signature: payload.signature ?? existing?.signature,
    updatedAt: toIso(createdAt),
  });
}

type BatchedReasoningPayload = {
  batch: true;
  details: Array<{
    detailId?: string;
    detailType: ReasoningDetailRecord["type"];
    format?: string;
    index?: number;
    text?: string;
    summary?: string;
    data?: string;
    signature?: string | null;
  }>;
  turn?: number;
};

type SingleReasoningPayload = {
  detailId?: string;
  detailType: ReasoningDetailRecord["type"];
  format?: string;
  index?: number;
  text?: string;
  summary?: string;
  data?: string;
  signature?: string | null;
  turn?: number;
};

function isBatchedReasoningPayload(payload: unknown): payload is BatchedReasoningPayload {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    (payload as { batch?: unknown }).batch === true &&
    Array.isArray((payload as { details?: unknown }).details)
  );
}

function isSingleReasoningPayload(payload: unknown): payload is SingleReasoningPayload {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    typeof (payload as { detailType?: unknown }).detailType === "string"
  );
}

export function mapReasoningState(events: ReasoningEventLike[]) {
  const merged = new Map<string, ReasoningDetailRecord>();

  for (const event of events) {
    if (event.kind !== "reasoning_detail" || !event.payload || !event.participantModelId) {
      continue;
    }

    if (isBatchedReasoningPayload(event.payload)) {
      const payload = event.payload;
      for (const detail of payload.details) {
        mergeReasoningDetailRecords(
          merged,
          event.stage as "generate" | "revise",
          event.participantModelId,
          {
            ...detail,
            turn: payload.turn,
          },
          event.createdAt,
        );
      }
      continue;
    }

    if (!isSingleReasoningPayload(event.payload)) {
      continue;
    }

    mergeReasoningDetailRecords(
      merged,
      event.stage as "generate" | "revise",
      event.participantModelId,
      event.payload,
      event.createdAt,
    );
  }

  return {
    details: sortReasoningDetails(Array.from(merged.values())),
  };
}

function mapReasoningStateFromSummaries(summaries: Doc<"runReasoningSummaries">[]) {
  return {
    details: sortReasoningDetails(
      summaries.map((summary) => ({
        id: summary.detailId,
        stage: summary.stage,
        modelId: summary.participantModelId,
        turn: summary.turn,
        type: summary.detailType,
        format: summary.format,
        index: summary.index,
        text: summary.text,
        summary: summary.summary,
        data: summary.data,
        signature: summary.signature,
        updatedAt: toIso(summary.updatedAt),
      })),
    ),
  };
}

function sortReasoningDetails(details: ReasoningDetailRecord[]) {
  return details.sort((a, b) => {
    if (a.modelId !== b.modelId) return a.modelId.localeCompare(b.modelId);
    if (a.stage !== b.stage) return a.stage.localeCompare(b.stage);
    if ((a.turn ?? 0) !== (b.turn ?? 0)) return (a.turn ?? 0) - (b.turn ?? 0);
    if (a.index !== undefined && b.index !== undefined && a.index !== b.index) return a.index - b.index;
    return a.id.localeCompare(b.id);
  });
}

export function canReadRun(
  run: Doc<"runs">,
  viewerUserId: Id<"users"> | null,
  projectMembership: Doc<"projectMembers"> | null,
  organizationMembership?: Doc<"organizationMembers"> | null,
) {
  if (run.visibility === "public" || run.visibility === "public_full") {
    return true;
  }
  if (!viewerUserId) {
    return false;
  }
  if (run.ownerUserId === viewerUserId) {
    return true;
  }
  if (projectMembership?.projectId === run.projectId) {
    return true;
  }
  if (run.visibility === "org_shared" && organizationMembership?.organizationId === run.organizationId) {
    return true;
  }
  return false;
}

export function canEditRun(
  run: Doc<"runs">,
  viewerUserId: Id<"users"> | null,
  projectMembership: Doc<"projectMembers"> | null,
) {
  if (!viewerUserId) {
    return false;
  }
  if (run.ownerUserId === viewerUserId) {
    return true;
  }
  return projectMembership?.role === "editor";
}

export function runDocToSummary(run: Doc<"runs">, canEdit = false): BenchmarkRunSummary {
  return {
    id: run._id,
    categoryId: run.categoryId,
    prompt: run.promptExcerpt,
    timestamp: toIso(run.createdAt),
    updatedAt: toIso(run.updatedAt),
    status: run.status,
    modelCount: run.participantCount,
    completedModelCount: run.completedParticipantCount,
    failedModelCount: run.failedParticipantCount,
    consumesConcurrencySlot: run.consumesConcurrencySlot,
    lastProgressAt: run.lastProgressAt ? toIso(run.lastProgressAt) : undefined,
    staleDeadlineAt: run.staleDeadlineAt ? toIso(run.staleDeadlineAt) : undefined,
    canEdit,
  };
}

export function runDocsToBenchmarkRun(args: {
  run: Doc<"runs">;
  participants: Doc<"runParticipants">[];
  compact: CompactRunDocs;
}): BenchmarkRun {
  const ideas = mapIdeas(args.participants, "generatedIdea");
  const revisedIdeas = mapIdeas(args.participants, "revisedIdea");
  const critiqueVotes = mapCritiqueVotes(args.participants);
  const finalRankings = mapRankings(args.participants);
  const history = controlHistoryFromDocs(args.compact.controls);
  const modelControls = defaultModelControls(args.participants);
  const controls: BenchmarkControlState = {
    history,
    modelControls,
    lastRunAction: history.at(-1)?.scope === "run" ? history.at(-1)?.action : undefined,
    lastRunActionAt: history.at(-1)?.scope === "run" ? history.at(-1)?.timestamp : undefined,
  };

  const modelStates: Record<string, ModelRunState> = {};
  for (const participant of args.participants) {
    modelStates[participant.modelId] = {
      modelId: participant.modelId,
      stage: participant.stage,
      status: participant.status,
      startedAt: participant.startedAt ? toIso(participant.startedAt) : undefined,
      completedAt: participant.completedAt ? toIso(participant.completedAt) : undefined,
      error: participant.error,
    };
  }

  return {
    id: args.run._id,
    categoryId: args.run.categoryId,
    prompt: args.run.prompt,
    selectedModels: args.run.selectedModels as BenchmarkRun["selectedModels"],
    timestamp: toIso(args.run.createdAt),
    updatedAt: toIso(args.run.updatedAt),
    status: args.run.status,
    currentStep: args.run.currentStep,
    exposureMode: args.run.visibility,
    error: args.run.error,
    ideas,
    critiqueVotes,
    humanCritiques: mapHumanCritiquesFromDocs(args.compact.humanCritiques),
    revisedIdeas,
    finalRankings,
    failedModels: uniqueModelIds(
      args.participants
        .filter((participant) => participant.status === "failed")
        .map((participant) => participant.modelId),
    ),
    modelStates,
    failures: mapFailuresFromDocs(args.compact.failures),
    checkpoint: deriveCheckpoint(args.run, args.participants),
    cancellation: {
      requested: args.run.cancellationRequested,
      requestedAt: args.run.cancellationRequested ? toIso(args.run.updatedAt) : undefined,
      reason:
        history.findLast((event) => event.scope === "run" && event.action === "cancel")?.reason ??
        (args.run.cancellationRequested ? "Canceled by user" : undefined),
    },
    controls,
    circuitBreaker: {
      status: "closed",
      failureCount: 0,
    },
    web: mapWebStateFromSources(args.compact.sources),
    reasoning: mapReasoningStateFromSummaries(args.compact.reasoningSummaries),
    metadata: {
      participantCount: args.run.participantCount,
      minimumSuccessfulModels: args.run.minimumSuccessfulModels,
    },
    consumesConcurrencySlot: args.run.consumesConcurrencySlot,
    lastProgressAt: args.run.lastProgressAt ? toIso(args.run.lastProgressAt) : undefined,
    staleDeadlineAt: args.run.staleDeadlineAt ? toIso(args.run.staleDeadlineAt) : undefined,
  };
}

export function runDocsToBenchmarkRunLite(args: {
  run: Doc<"runs">;
  participants: Doc<"runParticipants">[];
}): BenchmarkRun {
  return runDocsToBenchmarkRun({
    run: args.run,
    participants: args.participants,
    compact: {
      humanCritiques: [],
      sources: [],
      failures: [],
      controls: [],
      reasoningSummaries: [],
    },
  });
}

export function buildRunSearchText(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 4000);
}

export function buildPromptExcerpt(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237)}...`;
}

export function dayKeyFromTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}
