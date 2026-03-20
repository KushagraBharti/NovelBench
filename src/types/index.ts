export type ModelTier =
  | "flagship"
  | "reasoning"
  | "fast"
  | "mini"
  | "balanced"
  | "experimental";

export interface ModelPricing {
  inputPerMillion?: number;
  outputPerMillion?: number;
  currency?: string;
}

export interface ModelCatalogEntry {
  id: string;
  openRouterId: string;
  name: string;
  provider: string;
  lab: string;
  tier: ModelTier;
  tags: string[];
  description: string;
  personality: string;
  color: string;
  initial: string;
  defaultEnabled: boolean;
  active: boolean;
  supportsToolCalling?: boolean;
  pricing?: ModelPricing;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  examplePrompts: string[];
  systemPrompt: string;
  evaluationCriteria: string[];
  ideaSchema: IdeaFieldSpec[];
}

export interface IdeaFieldSpec {
  key: string;
  label: string;
  description: string;
}

export interface IdeaContent {
  title: string;
  summary: string;
  description: string;
  novelty: string;
  [key: string]: string;
}

export interface Idea {
  modelId: string;
  content: IdeaContent;
  raw: string;
  timestamp: string;
}

export interface CritiqueEntry {
  ideaLabel: string;
  targetModelId: string;
  strengths: string;
  weaknesses: string;
  suggestions: string;
  score: number;
  ranking?: number;
}

export interface CritiqueVoteResult {
  fromModelId: string;
  critiques: CritiqueEntry[];
  rankings: RankingEntry[];
}

export interface HumanCritiqueEntry extends CritiqueEntry {
  id: string;
  authorLabel: string;
  timestamp: string;
}

export interface RankingEntry {
  modelId: string;
  rank: number;
  score: number;
  reasoning: string;
}

export interface Ranking {
  judgeModelId: string;
  rankings: RankingEntry[];
}

export type WebEnabledStage = "generate" | "revise";

export interface SearchWebArgs {
  query: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  freshnessDays?: number;
  categoryHint?: "general" | "news" | "research" | "company" | "financial";
}

export interface SearchWebResultItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedDate?: string;
  snippet?: string;
  highlights?: string[];
  score?: number;
  contentPreview: string;
  truncated: boolean;
}

export interface ToolCallRecord {
  id: string;
  stage: WebEnabledStage;
  modelId: string;
  toolName: "search_web";
  startedAt: string;
  completedAt?: string;
  latencyMs?: number;
  args: SearchWebArgs;
  resultSummary?: {
    query: string;
    resultCount: number;
    urls: string[];
  };
  resultPayload?: {
    query: string;
    results: SearchWebResultItem[];
  };
  turn: number;
  error?: string;
}

export interface RetrievedSourceRecord {
  id: string;
  stage: WebEnabledStage;
  modelId: string;
  query: string;
  url: string;
  title?: string;
  domain?: string;
  publishedDate?: string;
  snippet?: string;
  highlights?: string[];
  contentPreview: string;
  truncated: boolean;
  retrievedAt: string;
}

export interface ModelStageWebUsageSummary {
  stage: WebEnabledStage;
  modelId: string;
  toolSupported: boolean;
  downgradedReason?: string;
  usedSearch: boolean;
  searchCalls: number;
  searchQueries: string[];
  sourceCount: number;
  totalLatencyMs: number;
}

export interface BenchmarkWebSearchConfig {
  maxSearchCallsPerStagePerModel: number;
  maxResultsPerSearch: number;
  maxCharsPerResult: number;
  perCallTimeoutMs: number;
  totalStageBudgetMs: number;
  maxLoopTurns: number;
}

export interface BenchmarkWebState {
  config: BenchmarkWebSearchConfig;
  toolCalls: ToolCallRecord[];
  retrievedSources: RetrievedSourceRecord[];
  usage: ModelStageWebUsageSummary[];
}

export type BenchmarkStatus =
  | "queued"
  | "generating"
  | "critiquing"
  | "awaiting_human_critique"
  | "revising"
  | "voting"
  | "complete"
  | "partial"
  | "canceled"
  | "dead_lettered"
  | "error";

export type RunCheckpointStage =
  | "generate"
  | "critique"
  | "human_critique"
  | "revise"
  | "vote"
  | "complete";

export interface RunCheckpoint {
  stage: RunCheckpointStage;
  completedModelIds: string[];
  readyForRevisionModelIds: string[];
  updatedAt: string;
}

export type ModelExecutionStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "canceled"
  | "skipped";

export interface ModelRunState {
  modelId: string;
  stage: RunCheckpointStage;
  status: ModelExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface RunFailureRecord {
  id: string;
  stage: RunCheckpointStage;
  modelId?: string;
  message: string;
  retryable: boolean;
  timestamp: string;
}

export interface RunCancellation {
  requested: boolean;
  requestedAt?: string;
  reason?: string;
}

export interface CircuitBreakerState {
  status: "closed" | "open" | "half_open";
  openedAt?: string;
  cooldownUntil?: string;
  failureCount: number;
  lastFailureAt?: string;
  reason?: string;
}

export type ExposureMode = "public_full";

export interface BenchmarkRun {
  id: string;
  categoryId: string;
  prompt: string;
  selectedModels: ModelCatalogEntry[];
  timestamp: string;
  updatedAt: string;
  status: BenchmarkStatus;
  currentStep: string;
  exposureMode: ExposureMode;
  error?: string;
  ideas: Idea[];
  critiqueVotes: CritiqueVoteResult[];
  humanCritiques: HumanCritiqueEntry[];
  revisedIdeas: Idea[];
  finalRankings: Ranking[];
  failedModels: string[];
  modelStates: Record<string, ModelRunState>;
  failures: RunFailureRecord[];
  checkpoint: RunCheckpoint;
  cancellation: RunCancellation;
  circuitBreaker: CircuitBreakerState;
  web: BenchmarkWebState;
  metadata: {
    participantCount: number;
    minimumSuccessfulModels: number;
  };
}

export interface BenchmarkProgress {
  status: BenchmarkStatus;
  step: string;
  run: BenchmarkRun;
}

export interface BenchmarkRunSummary {
  id: string;
  categoryId: string;
  prompt: string;
  timestamp: string;
  updatedAt: string;
  status: BenchmarkStatus;
  modelCount: number;
  completedModelCount: number;
  failedModelCount: number;
}

export interface LeaderboardEntry {
  modelId: string;
  modelName: string;
  provider: string;
  wins: number;
  totalRuns: number;
  averageScore: number;
  averageRank: number;
  averageCritiqueScore: number;
}

export interface AggregatedScore {
  modelId: string;
  modelName: string;
  averageRank: number;
  averageScore: number;
  critiqueScoreAvg: number;
}

export interface LeaderboardData {
  global: LeaderboardEntry[];
  byCategory: Record<string, LeaderboardEntry[]>;
  totals: {
    runs: number;
    ideas: number;
    critiques: number;
    completedModels: number;
  };
}

export interface ModelSelectionInput {
  selectedModelIds: string[];
  customModelIds?: string[];
}

export interface CreateBenchmarkRunInput extends ModelSelectionInput {
  categoryId: string;
  prompt: string;
}

export interface BenchmarkCreateResponse {
  id: string;
  status: BenchmarkStatus;
}
