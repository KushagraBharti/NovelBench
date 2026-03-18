export interface Model {
  id: string;
  name: string;
  provider: string;
  openRouterId: string;
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

// --- Structured JSON responses from models ---

export interface IdeaContent {
  title: string;
  summary: string;
  description: string;
  novelty: string;
  [key: string]: string; // category-specific extra fields
}

export interface Idea {
  modelId: string;
  content: IdeaContent;
  raw: string; // raw LLM response for debugging
  timestamp: string;
}

export interface CritiqueEntry {
  ideaLabel: string; // "A", "B", "C", etc.
  targetModelId: string;
  strengths: string;
  weaknesses: string;
  suggestions: string;
  score: number; // 1-10
}

export interface CritiqueVoteResult {
  fromModelId: string;
  critiques: CritiqueEntry[];
  rankings: RankingEntry[];
}

export interface RankingEntry {
  modelId: string;
  rank: number;
  score: number; // 1-10 rating
  reasoning: string;
}

export interface Ranking {
  judgeModelId: string;
  rankings: RankingEntry[];
}

export type BenchmarkStatus =
  | "generating"
  | "critiquing"
  | "revising"
  | "voting"
  | "complete"
  | "error";

export interface BenchmarkRun {
  id: string;
  categoryId: string;
  prompt: string;
  timestamp: string;
  status: BenchmarkStatus;
  error?: string;
  ideas: Idea[];
  critiqueVotes: CritiqueVoteResult[];
  revisedIdeas: Idea[];
  finalRankings: Ranking[];
}

export interface BenchmarkProgress {
  status: BenchmarkStatus;
  step: string;
  run: BenchmarkRun;
}

export interface AggregatedScore {
  modelId: string;
  modelName: string;
  averageRank: number;
  averageScore: number;
  critiqueScoreAvg: number;
}
