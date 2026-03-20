import { ReasoningConfig } from "./openrouter";

export const REASONING_GENERATE: ReasoningConfig = { effort: "medium", exclude: true };
export const REASONING_CRITIQUE: ReasoningConfig = { effort: "medium", exclude: true };
export const REASONING_REVISE: ReasoningConfig = { effort: "medium", exclude: true };
export const REASONING_VOTE: ReasoningConfig = { effort: "medium", exclude: true };
export const MODEL_TIMEOUT_MS = 180_000;
export const JSON_RETRY_MESSAGE =
  "Your response was not valid JSON. Please respond with ONLY valid JSON in the exact format specified above. No markdown, no explanation; only the JSON object.";
