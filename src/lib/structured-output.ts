import { Category, CritiqueEntry, IdeaContent, RankingEntry } from "@/types";

const DEFAULT_IDEA_KEYS = ["title", "summary", "description", "novelty"];

function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function decodeJsonStringFragment(value: string): string {
  const candidates = [value, value.replace(/\\$/, ""), value.replace(/\r/g, "\\r").replace(/\n/g, "\\n")];
  for (const candidate of candidates) {
    try {
      return JSON.parse(`"${candidate}"`) as string;
    } catch {
      // Try the next representation.
    }
  }

  return value
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractBalancedJsonObject(raw: string): string | null {
  const text = stripCodeFences(raw);
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function repairJsonLikeObject(raw: string): string | null {
  const text = stripCodeFences(raw);
  const start = text.indexOf("{");
  if (start === -1) return null;

  let candidate = text.slice(start).trim();
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");

  let inString = false;
  let escaped = false;
  let openBraces = 0;
  let openBrackets = 0;

  for (const char of candidate) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") openBraces += 1;
    if (char === "}") openBraces = Math.max(0, openBraces - 1);
    if (char === "[") openBrackets += 1;
    if (char === "]") openBrackets = Math.max(0, openBrackets - 1);
  }

  if (inString) candidate += "\"";
  if (openBrackets > 0) candidate += "]".repeat(openBrackets);
  if (openBraces > 0) candidate += "}".repeat(openBraces);

  return candidate;
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const candidates = [
    extractBalancedJsonObject(raw),
    stripCodeFences(raw),
    repairJsonLikeObject(raw),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function extractJsonLikeFields(raw: string, keys: string[]): Record<string, string> {
  const text = stripCodeFences(raw);
  const extracted: Record<string, string> = {};

  keys.forEach((key, index) => {
    const followingKeys = keys.slice(index + 1).map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const terminator =
      followingKeys.length > 0
        ? `(?=\\s*,\\s*"(?:${followingKeys.join("|")})"\\s*:|\\s*}\\s*$|$)`
        : `(?=\\s*}\\s*$|$)`;
    const pattern = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"([\\s\\S]*?)${terminator}`, "i");
    const match = text.match(pattern);
    if (!match) return;
    extracted[key] = decodeJsonStringFragment(match[1].trim());
  });

  return extracted;
}

function extractLabeledFields(raw: string, category?: Category): Record<string, string> {
  if (!category) return {};

  const text = stripCodeFences(raw);
  const extracted: Record<string, string> = {};

  category.ideaSchema.forEach((field, index) => {
    const label = field.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const laterLabels = category.ideaSchema
      .slice(index + 1)
      .map((entry) => entry.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const terminator =
      laterLabels.length > 0 ? `(?=\\n(?:${laterLabels.join("|")}):)` : `(?=$)`;
    const pattern = new RegExp(`(?:^|\\n)${label}:?\\s*([\\s\\S]*?)${terminator}`, "i");
    const match = text.match(pattern);
    if (!match) return;
    extracted[field.key] = match[1].trim();
  });

  return extracted;
}

function valueToString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function normalizeIdeaContent(raw: string, category?: Category): IdeaContent {
  const parsed = tryParseJsonObject(raw);
  const schemaKeys = category?.ideaSchema.map((field) => field.key) ?? DEFAULT_IDEA_KEYS;
  const jsonLikeFields = extractJsonLikeFields(raw, schemaKeys);
  const labeledFields = extractLabeledFields(raw, category);

  const content: IdeaContent = {
    title: "",
    summary: "",
    description: "",
    novelty: "",
  };

  for (const key of schemaKeys) {
    const parsedValue = parsed ? valueToString(parsed[key]) : "";
    const jsonLikeValue = jsonLikeFields[key] ?? "";
    const labeledValue = labeledFields[key] ?? "";
    const value = parsedValue || jsonLikeValue || labeledValue;
    if (value) {
      content[key] = value;
    }
  }

  const fallbackText = stripCodeFences(raw);
  if (!content.title) {
    const firstLine = fallbackText.split("\n").map((line) => line.trim()).find(Boolean);
    if (firstLine && !firstLine.startsWith("{")) {
      content.title = firstLine.slice(0, 160);
    }
  }

  if (!content.summary && content.description) {
    content.summary = content.description.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 240) ?? "";
  }

  if (!content.description) {
    const descriptiveField =
      Object.entries(content)
        .filter(([key, value]) => key !== "title" && key !== "summary" && typeof value === "string" && value.trim().length > 0)
        .map(([, value]) => value)[0] ?? "";
    content.description = descriptiveField || fallbackText;
  }

  if (!content.novelty) {
    const candidate = Object.entries(content)
      .filter(([key, value]) => key !== "title" && key !== "summary" && key !== "description" && typeof value === "string" && value.trim().length > 0)
      .map(([, value]) => value)[0];
    if (typeof candidate === "string") {
      content.novelty = candidate;
    }
  }

  if (!content.title) {
    content.title = "Untitled";
  }

  return content;
}

export function isUsableIdeaResponse(raw: string, category?: Category): boolean {
  const content = normalizeIdeaContent(raw, category);
  const substantiveFields = Object.values(content).filter(
    (value) => typeof value === "string" && value.trim().length >= 24
  ).length;

  return content.title !== "Untitled" && (substantiveFields >= 2 || content.description.trim().length >= 120);
}

function normalizeRankingEntry(entry: Record<string, unknown>, labelToModel: Map<string, string>): RankingEntry | null {
  const label = valueToString(entry.label);
  const modelId = labelToModel.get(label) || label;
  const rank = Number(entry.rank);
  const score = Number(entry.score);
  if (!modelId || Number.isNaN(rank)) return null;

  return {
    modelId,
    rank,
    score: Number.isNaN(score) ? 5 : Math.max(1, Math.min(10, Math.round(score))),
    reasoning: valueToString(entry.reasoning),
  };
}

function normalizeCritiqueEntry(entry: Record<string, unknown>, labelToModel: Map<string, string>): CritiqueEntry | null {
  const ideaLabel = valueToString(entry.ideaLabel);
  const targetModelId = labelToModel.get(ideaLabel) || ideaLabel;
  if (!ideaLabel || !targetModelId) return null;

  return {
    ideaLabel,
    targetModelId,
    strengths: valueToString(entry.strengths),
    weaknesses: valueToString(entry.weaknesses),
    suggestions: valueToString(entry.suggestions),
    score: Math.max(1, Math.min(10, Math.round(Number(entry.score) || 5))),
  };
}

export function normalizeCritiqueVoteResponse(
  raw: string,
  anonymousMap: Map<string, string>
): { critiques: CritiqueEntry[]; rankings: RankingEntry[] } {
  const labelToModel = new Map<string, string>();
  for (const [modelId, label] of anonymousMap) {
    labelToModel.set(label, modelId);
  }

  const parsed = tryParseJsonObject(raw);
  const rawCritiques = Array.isArray(parsed?.critiques) ? parsed.critiques : [];
  const rawRankings = Array.isArray(parsed?.rankings) ? parsed.rankings : [];

  return {
    critiques: rawCritiques
      .map((entry) =>
        entry && typeof entry === "object" ? normalizeCritiqueEntry(entry as Record<string, unknown>, labelToModel) : null
      )
      .filter((entry): entry is CritiqueEntry => Boolean(entry)),
    rankings: rawRankings
      .map((entry) =>
        entry && typeof entry === "object" ? normalizeRankingEntry(entry as Record<string, unknown>, labelToModel) : null
      )
      .filter((entry): entry is RankingEntry => Boolean(entry)),
  };
}

export function normalizeFinalVoteResponse(raw: string, anonymousMap: Map<string, string>): RankingEntry[] {
  const labelToModel = new Map<string, string>();
  for (const [modelId, label] of anonymousMap) {
    labelToModel.set(label, modelId);
  }

  const parsed = tryParseJsonObject(raw);
  const rawRankings = Array.isArray(parsed?.rankings) ? parsed.rankings : [];
  return rawRankings
    .map((entry) =>
      entry && typeof entry === "object" ? normalizeRankingEntry(entry as Record<string, unknown>, labelToModel) : null
    )
    .filter((entry): entry is RankingEntry => Boolean(entry));
}
