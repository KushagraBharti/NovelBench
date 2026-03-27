import { describe, expect, it } from "vitest";
import { mapReasoningState, runDocsToBenchmarkRunLite } from "../../convex/lib/runHelpers";
import { filterLiveActivityEventsSince, participantCounterDeltas } from "../../convex/runs";

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    _id: "run_1",
    _creationTime: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    categoryId: "venture",
    prompt: "Test prompt",
    promptExcerpt: "Test prompt",
    status: "generating",
    currentStep: "Generating ideas...",
    visibility: "public_full",
    checkpointStage: "generate",
    pauseRequested: false,
    cancellationRequested: false,
    participantCount: 2,
    completedParticipantCount: 1,
    failedParticipantCount: 0,
    minimumSuccessfulModels: 1,
    finalWinnerModelId: undefined,
    finalWinnerName: undefined,
    error: undefined,
    exportCount: 0,
    projectId: "project_1",
    organizationId: "org_1",
    ownerUserId: "user_1",
    selectedModels: [
      { id: "model-a", name: "Model A", provider: "openrouter", openRouterId: "a" },
      { id: "model-b", name: "Model B", provider: "openrouter", openRouterId: "b" },
    ],
    ...overrides,
  } as any;
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    _id: "participant_1",
    _creationTime: Date.now(),
    runId: "run_1",
    modelId: "model-a",
    modelName: "Model A",
    openRouterId: "a",
    provider: "openrouter",
    order: 0,
    stage: "generate",
    status: "complete",
    startedAt: Date.now() - 1000,
    completedAt: Date.now(),
    generatedIdea: {
      title: "Idea A",
      summary: "Summary",
      description: "Description",
      novelty: "Novelty",
    },
    critiqueResult: undefined,
    revisedIdea: undefined,
    finalRanking: undefined,
    latencyMs: 1000,
    inputTokens: 10,
    outputTokens: 20,
    estimatedCostUsd: 0.01,
    error: undefined,
    ...overrides,
  } as any;
}

describe("Convex bandwidth helpers", () => {
  it("keeps participant-derived fields and clears heavy event-derived fields for lite runs", () => {
    const result = runDocsToBenchmarkRunLite({
      run: makeRun(),
      participants: [
        makeParticipant(),
        makeParticipant({
          _id: "participant_2",
          order: 1,
          modelId: "model-b",
          modelName: "Model B",
          openRouterId: "b",
          status: "running",
          generatedIdea: undefined,
        }),
      ],
    });

    expect(result.id).toBe("run_1");
    expect(result.ideas).toHaveLength(1);
    expect(result.failedModels).toEqual([]);
    expect(result.metadata.participantCount).toBe(2);
    expect(result.humanCritiques).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.controls.history).toEqual([]);
    expect(result.web.toolCalls).toEqual([]);
    expect(result.reasoning.details).toEqual([]);
    expect(result.cancellation.reason).toBeUndefined();
  });

  it("merges legacy single-detail and batched reasoning payloads", () => {
    const state = mapReasoningState([
      {
        _id: "evt_1",
        _creationTime: Date.now(),
        runId: "run_1",
        stage: "generate",
        kind: "reasoning_detail",
        participantModelId: "model-a",
        message: "legacy",
        createdAt: 100,
        payload: {
          detailId: "detail-1",
          detailType: "reasoning.text",
          text: "hello ",
          turn: 1,
        },
      },
      {
        _id: "evt_2",
        _creationTime: Date.now(),
        runId: "run_1",
        stage: "generate",
        kind: "reasoning_detail",
        participantModelId: "model-a",
        message: "batch",
        createdAt: 101,
        payload: {
          batch: true,
          turn: 1,
          details: [
            {
              detailId: "detail-1",
              detailType: "reasoning.text",
              text: "world",
            },
            {
              detailId: "detail-2",
              detailType: "reasoning.summary",
              summary: "short summary",
            },
          ],
        },
      },
    ] as any);

    expect(state.details).toHaveLength(2);
    expect(state.details.find((entry) => entry.id === "detail-1")?.text).toBe("hello world");
    expect(state.details.find((entry) => entry.id === "detail-2")?.summary).toBe("short summary");
  });

  it("uses createdAt plus event id ordering for same-timestamp live events", () => {
    const events = [
      { _id: "a", createdAt: 100 },
      { _id: "b", createdAt: 100 },
      { _id: "c", createdAt: 101 },
    ] as any;

    expect(filterLiveActivityEventsSince(events, { createdAt: 100, eventId: "a" })).toEqual([
      { _id: "b", createdAt: 100 },
      { _id: "c", createdAt: 101 },
    ]);
  });

  it("replays inclusive timestamp results when only createdAt is known", () => {
    const events = [
      { _id: "a", createdAt: 100 },
      { _id: "b", createdAt: 100 },
      { _id: "c", createdAt: 101 },
    ] as any;

    expect(filterLiveActivityEventsSince(events, { createdAt: 100 })).toEqual(events);
  });

  it("updates participant counters correctly across terminal-state transitions", () => {
    expect(participantCounterDeltas("failed" as any, "complete" as any)).toEqual({
      completedDelta: 1,
      failedDelta: -1,
    });
    expect(participantCounterDeltas("running" as any, "paused" as any)).toEqual({
      completedDelta: 0,
      failedDelta: 0,
    });
    expect(participantCounterDeltas("complete" as any, "failed" as any)).toEqual({
      completedDelta: -1,
      failedDelta: 1,
    });
  });
});
