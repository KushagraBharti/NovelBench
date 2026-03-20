import { promises as fs } from "fs";
import path from "path";
import {
  BenchmarkRun,
  BenchmarkRunSummary,
  BenchmarkWebState,
  CircuitBreakerState,
  CreateBenchmarkRunInput,
  ModelCatalogEntry,
  ModelRunState,
  RunCheckpoint,
  RunCheckpointStage,
} from "@/types";
import {
  MODEL_SELECTION_LIMITS,
  createBringYourOwnModel,
  getDefaultModels,
  getModelById,
  resolveSelectedModels,
} from "./models";
import { DEFAULT_WEB_SEARCH_CONFIG } from "./web-search";

const DATA_DIR = path.join(process.cwd(), "data");
const RUNS_DIR = path.join(DATA_DIR, "runs");
const LEGACY_DATA_DIR = DATA_DIR;

export interface BenchmarkRepository {
  createRun(input: CreateBenchmarkRunInput): Promise<BenchmarkRun>;
  saveRun(run: BenchmarkRun): Promise<void>;
  loadRun(id: string): Promise<BenchmarkRun | null>;
  updateRun(id: string, updater: (run: BenchmarkRun) => BenchmarkRun): Promise<BenchmarkRun | null>;
  listRuns(): Promise<BenchmarkRun[]>;
  listSummaries(): Promise<BenchmarkRunSummary[]>;
  listRunsByStatus(statuses: BenchmarkRun["status"][]): Promise<BenchmarkRun[]>;
}

async function ensureDataDir() {
  await fs.mkdir(RUNS_DIR, { recursive: true });
}

async function safeReaddir(directory: string): Promise<string[]> {
  try {
    return await fs.readdir(directory);
  } catch {
    return [];
  }
}

function generateId(): string {
  return `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildModelStates(models: ModelCatalogEntry[]): Record<string, ModelRunState> {
  return Object.fromEntries(
    models.map((model) => [
      model.id,
      {
        modelId: model.id,
        status: "queued",
        stage: "generate",
      },
    ])
  );
}

function createCheckpoint(): RunCheckpoint {
  return {
    stage: "generate",
    completedModelIds: [],
    readyForRevisionModelIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function createCircuitBreakerState(): CircuitBreakerState {
  return {
    status: "closed",
    failureCount: 0,
  };
}

function createWebState(): BenchmarkWebState {
  return {
    config: {
      ...DEFAULT_WEB_SEARCH_CONFIG,
    },
    toolCalls: [],
    retrievedSources: [],
    usage: [],
  };
}

function minimumSuccessfulModels(participantCount: number): number {
  return Math.max(MODEL_SELECTION_LIMITS.min, Math.min(participantCount, Math.ceil(participantCount / 2)));
}

function toSummary(run: BenchmarkRun): BenchmarkRunSummary {
  const completedModelCount = Object.values(run.modelStates).filter(
    (state) => state.status === "complete"
  ).length;
  return {
    id: run.id,
    categoryId: run.categoryId,
    prompt: run.prompt,
    timestamp: run.timestamp,
    updatedAt: run.updatedAt,
    status: run.status,
    modelCount: run.selectedModels.length,
    completedModelCount,
    failedModelCount: run.failedModels.length,
  };
}

async function runPath(id: string): Promise<string> {
  await ensureDataDir();
  return path.join(RUNS_DIR, `${id}.json`);
}

async function legacyRunPath(id: string): Promise<string> {
  return path.join(LEGACY_DATA_DIR, `${id}.json`);
}

function inferSelectedModels(run: Partial<BenchmarkRun>) {
  const knownIds = new Set<string>();
  const orderedIds: string[] = [];

  for (const entry of run.ideas ?? []) {
    if (!knownIds.has(entry.modelId)) {
      knownIds.add(entry.modelId);
      orderedIds.push(entry.modelId);
    }
  }
  for (const entry of run.revisedIdeas ?? []) {
    if (!knownIds.has(entry.modelId)) {
      knownIds.add(entry.modelId);
      orderedIds.push(entry.modelId);
    }
  }
  for (const entry of run.critiqueVotes ?? []) {
    if (!knownIds.has(entry.fromModelId)) {
      knownIds.add(entry.fromModelId);
      orderedIds.push(entry.fromModelId);
    }
  }
  for (const entry of run.finalRankings ?? []) {
    if (!knownIds.has(entry.judgeModelId)) {
      knownIds.add(entry.judgeModelId);
      orderedIds.push(entry.judgeModelId);
    }
  }

  return orderedIds.map((modelId) => getModelById(modelId) ?? createBringYourOwnModel(modelId));
}

function normalizeLegacyRun(run: Partial<BenchmarkRun>): BenchmarkRun {
  const selectedModels = run.selectedModels?.length ? run.selectedModels : inferSelectedModels(run);
  const participantCount = selectedModels.length;
  const ideas = run.ideas ?? [];
  const critiqueVotes = run.critiqueVotes ?? [];
  const revisedIdeas = run.revisedIdeas ?? [];
  const finalRankings = run.finalRankings ?? [];
  const failedModels = run.failedModels ?? [];
  const humanCritiques = run.humanCritiques ?? [];
  const modelStates =
    run.modelStates && Object.keys(run.modelStates).length > 0
      ? run.modelStates
      : buildModelStates(selectedModels);

  for (const idea of ideas) {
    modelStates[idea.modelId] = {
      modelId: idea.modelId,
      stage: "generate",
      status: "complete",
      completedAt: idea.timestamp,
    };
  }
  for (const vote of critiqueVotes) {
    modelStates[vote.fromModelId] = {
      modelId: vote.fromModelId,
      stage: "critique",
      status: "complete",
      completedAt: new Date().toISOString(),
    };
  }
  for (const revisedIdea of revisedIdeas) {
    modelStates[revisedIdea.modelId] = {
      modelId: revisedIdea.modelId,
      stage: "revise",
      status: "complete",
      completedAt: revisedIdea.timestamp,
    };
  }
  for (const ranking of finalRankings) {
    modelStates[ranking.judgeModelId] = {
      modelId: ranking.judgeModelId,
      stage: "vote",
      status: "complete",
      completedAt: new Date().toISOString(),
    };
  }
  for (const failedModel of failedModels) {
    modelStates[failedModel] = {
      modelId: failedModel,
      stage: run.checkpoint?.stage ?? "generate",
      status: "failed",
      completedAt: new Date().toISOString(),
    };
  }

  return {
    id: run.id ?? generateId(),
    categoryId: run.categoryId ?? "venture",
    prompt: run.prompt ?? "",
    selectedModels,
    timestamp: run.timestamp ?? new Date().toISOString(),
    updatedAt: run.updatedAt ?? run.timestamp ?? new Date().toISOString(),
    status: run.status ?? "complete",
    currentStep: run.currentStep ?? (run.status === "complete" ? "Benchmark complete!" : "Recovered legacy run"),
    exposureMode: run.exposureMode ?? "public_full",
    error: run.error,
    ideas,
    critiqueVotes,
    humanCritiques,
    revisedIdeas,
    finalRankings,
    failedModels,
    modelStates,
    failures: run.failures ?? [],
    checkpoint:
      run.checkpoint ??
      createCheckpointForStage(
        finalRankings.length > 0
          ? "complete"
          : revisedIdeas.length > 0
            ? "vote"
            : critiqueVotes.length > 0
              ? "revise"
              : "generate",
        selectedModels.map((model) => model.id),
        revisedIdeas.map((idea) => idea.modelId)
      ),
    cancellation: run.cancellation ?? { requested: false },
    circuitBreaker: run.circuitBreaker ?? createCircuitBreakerState(),
    web: run.web ?? createWebState(),
    metadata:
      run.metadata ?? {
        participantCount,
        minimumSuccessfulModels: minimumSuccessfulModels(participantCount),
      },
  };
}

async function readRunFile(filePath: string): Promise<BenchmarkRun> {
  const content = await fs.readFile(filePath, "utf-8");
  return normalizeLegacyRun(JSON.parse(content) as Partial<BenchmarkRun>);
}

async function migrateLegacyRuns() {
  await ensureDataDir();
  const legacyFiles = (await safeReaddir(LEGACY_DATA_DIR)).filter(
    (file) => file.endsWith(".json") && file.startsWith("bench_")
  );

  for (const file of legacyFiles) {
    const source = path.join(LEGACY_DATA_DIR, file);
    const destination = path.join(RUNS_DIR, file);
    try {
      await fs.access(destination);
      continue;
    } catch {
      // Destination missing; continue migration.
    }

    try {
      const normalized = await readRunFile(source);
      await fs.writeFile(destination, JSON.stringify(normalized, null, 2), "utf-8");
    } catch {
      // Ignore unreadable legacy runs.
    }
  }
}

class FileBenchmarkRepository implements BenchmarkRepository {
  async createRun(input: CreateBenchmarkRunInput): Promise<BenchmarkRun> {
    const selectedModels = resolveSelectedModels(
      input.selectedModelIds.length > 0 ? input.selectedModelIds : getDefaultModels().map((model) => model.id),
      input.customModelIds
    );

    if (selectedModels.length < MODEL_SELECTION_LIMITS.min) {
      throw new Error(`Select at least ${MODEL_SELECTION_LIMITS.min} models`);
    }

    if (selectedModels.length > MODEL_SELECTION_LIMITS.max) {
      throw new Error(`Select at most ${MODEL_SELECTION_LIMITS.max} models`);
    }

    const now = new Date().toISOString();
    const run: BenchmarkRun = {
      id: generateId(),
      categoryId: input.categoryId,
      prompt: input.prompt,
      selectedModels,
      timestamp: now,
      updatedAt: now,
      status: "queued",
      currentStep: "Queued for execution",
      exposureMode: "public_full",
      ideas: [],
      critiqueVotes: [],
      humanCritiques: [],
      revisedIdeas: [],
      finalRankings: [],
      failedModels: [],
      modelStates: buildModelStates(selectedModels),
      failures: [],
      checkpoint: createCheckpoint(),
      cancellation: { requested: false },
      circuitBreaker: createCircuitBreakerState(),
      web: createWebState(),
      metadata: {
        participantCount: selectedModels.length,
        minimumSuccessfulModels: minimumSuccessfulModels(selectedModels.length),
      },
    };

    await this.saveRun(run);
    return run;
  }

  async saveRun(run: BenchmarkRun): Promise<void> {
    const filePath = await runPath(run.id);
    const payload = {
      ...run,
      updatedAt: new Date().toISOString(),
      checkpoint: {
        ...run.checkpoint,
        updatedAt: new Date().toISOString(),
      },
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  }

  async loadRun(id: string): Promise<BenchmarkRun | null> {
    await migrateLegacyRuns();
    try {
      const filePath = await runPath(id);
      return await readRunFile(filePath);
    } catch {
      try {
        const legacyPath = await legacyRunPath(id);
        return await readRunFile(legacyPath);
      } catch {
        return null;
      }
    }
  }

  async updateRun(
    id: string,
    updater: (run: BenchmarkRun) => BenchmarkRun
  ): Promise<BenchmarkRun | null> {
    const run = await this.loadRun(id);
    if (!run) return null;
    const next = updater(run);
    await this.saveRun(next);
    return next;
  }

  async listRuns(): Promise<BenchmarkRun[]> {
    await ensureDataDir();
    await migrateLegacyRuns();
    try {
      const files = await safeReaddir(RUNS_DIR);
      const runs = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => readRunFile(path.join(RUNS_DIR, file)))
      );
      runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return runs;
    } catch {
      return [];
    }
  }

  async listSummaries(): Promise<BenchmarkRunSummary[]> {
    const runs = await this.listRuns();
    return runs.map(toSummary);
  }

  async listRunsByStatus(statuses: BenchmarkRun["status"][]): Promise<BenchmarkRun[]> {
    const runs = await this.listRuns();
    return runs.filter((run) => statuses.includes(run.status));
  }
}

let repositorySingleton: BenchmarkRepository | null = null;

export function getBenchmarkRepository(): BenchmarkRepository {
  if (!repositorySingleton) {
    repositorySingleton = new FileBenchmarkRepository();
  }
  return repositorySingleton;
}

export async function saveBenchmarkRun(run: BenchmarkRun): Promise<void> {
  await getBenchmarkRepository().saveRun(run);
}

export async function loadBenchmarkRun(id: string): Promise<BenchmarkRun | null> {
  return getBenchmarkRepository().loadRun(id);
}

export async function listBenchmarkRuns(): Promise<BenchmarkRun[]> {
  return getBenchmarkRepository().listRuns();
}

export async function listBenchmarkRunSummaries(): Promise<BenchmarkRunSummary[]> {
  return getBenchmarkRepository().listSummaries();
}

export async function updateBenchmarkRun(
  id: string,
  updater: (run: BenchmarkRun) => BenchmarkRun
): Promise<BenchmarkRun | null> {
  return getBenchmarkRepository().updateRun(id, updater);
}

export function createCheckpointForStage(
  stage: RunCheckpointStage,
  completedModelIds: string[],
  readyForRevisionModelIds: string[] = []
): RunCheckpoint {
  return {
    stage,
    completedModelIds,
    readyForRevisionModelIds,
    updatedAt: new Date().toISOString(),
  };
}
