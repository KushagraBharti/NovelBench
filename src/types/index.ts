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
}

export interface Idea {
  modelId: string;
  content: string;
  timestamp: string;
}

export interface Critique {
  fromModelId: string;
  toModelId: string;
  content: string;
  score: number; // 1-10
}

export interface RankingEntry {
  modelId: string;
  rank: number;
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
  critiques: Critique[];
  round1Rankings: Ranking[];
  revisedIdeas: Idea[];
  round2Rankings: Ranking[];
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
  totalScore: number;
  critiqueScoreAvg: number;
}
