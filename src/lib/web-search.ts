import {
  RetrievedSourceRecord,
  SearchWebArgs,
  SearchWebResultItem,
  WebEnabledStage,
} from "@/types";

const EXA_SEARCH_API_URL = "https://api.exa.ai/search";

export const DEFAULT_WEB_SEARCH_CONFIG = {
  maxSearchCallsPerStagePerModel: 2,
  maxResultsPerSearch: 3,
  maxCharsPerResult: 20_000,
  perCallTimeoutMs: 10_000,
  totalStageBudgetMs: 30_000,
  maxLoopTurns: 6,
} as const;

interface ExaSearchResult {
  title?: string;
  url: string;
  publishedDate?: string;
  score?: number;
  text?: string;
}

interface ExaSearchResponse {
  results?: ExaSearchResult[];
}

export interface SearchWebPayload {
  query: string;
  results: SearchWebResultItem[];
}

function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${ms}ms`)), ms);

  signal?.addEventListener(
    "abort",
    () => {
      controller.abort(signal.reason);
      clearTimeout(timer);
    },
    { once: true }
  );

  controller.signal.addEventListener(
    "abort",
    () => clearTimeout(timer),
    { once: true }
  );

  return controller.signal;
}

function clampMaxResults(value: number | undefined): number {
  const desired = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_WEB_SEARCH_CONFIG.maxResultsPerSearch;
  return Math.max(1, Math.min(DEFAULT_WEB_SEARCH_CONFIG.maxResultsPerSearch, desired));
}

function sanitizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function trimText(value: string | undefined, maxChars: number): { text: string; truncated: boolean } {
  const normalized = (value ?? "").trim();
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }

  return {
    text: `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`,
    truncated: true,
  };
}

function normalizeResult(result: ExaSearchResult, index: number, maxChars: number): SearchWebResultItem {
  const text = trimText(result.text, maxChars);
  const snippet = text.text.slice(0, 320);

  return {
    id: `${result.url}#${index}`,
    title: result.title?.trim() || domainFromUrl(result.url) || "Untitled source",
    url: result.url,
    domain: domainFromUrl(result.url),
    publishedDate: result.publishedDate,
    snippet,
    score: typeof result.score === "number" ? result.score : undefined,
    contentPreview: text.text,
    truncated: text.truncated,
  };
}

function mapCategoryHintToExaCategory(
  hint: SearchWebArgs["categoryHint"]
): "news" | "research paper" | "company" | "financial report" | undefined {
  switch (hint) {
    case "news":
      return "news";
    case "research":
      return "research paper";
    case "company":
      return "company";
    case "financial":
      return "financial report";
    default:
      return undefined;
  }
}

function buildExaSearchBody(args: SearchWebArgs, maxResults: number, maxChars: number): Record<string, unknown> {
  const category = mapCategoryHintToExaCategory(args.categoryHint);
  const body: Record<string, unknown> = {
    query: sanitizeQuery(args.query),
    numResults: maxResults,
    type: "auto",
    contents: {
      text: {
        maxCharacters: maxChars,
      },
    },
  };

  if (category) {
    body.category = category;
  }

  const supportsExcludeDomains = category !== "company";
  const supportsPublishedDateFilter = category !== "company";

  if (args.includeDomains?.length) {
    body.includeDomains = args.includeDomains.map((entry) => entry.trim()).filter(Boolean);
  }

  if (supportsExcludeDomains && args.excludeDomains?.length) {
    body.excludeDomains = args.excludeDomains.map((entry) => entry.trim()).filter(Boolean);
  }

  if (
    supportsPublishedDateFilter &&
    typeof args.freshnessDays === "number" &&
    Number.isFinite(args.freshnessDays) &&
    args.freshnessDays > 0
  ) {
    const startDate = new Date(Date.now() - args.freshnessDays * 24 * 60 * 60 * 1000).toISOString();
    body.startPublishedDate = startDate;
  }

  return body;
}

export async function searchWebWithExa(
  args: SearchWebArgs,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    maxResults?: number;
    maxCharsPerResult?: number;
  } = {}
): Promise<SearchWebPayload> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error("EXA_API_KEY is not set in environment variables");
  }

  const query = sanitizeQuery(args.query);
  if (!query) {
    throw new Error("search_web requires a non-empty query");
  }

  const maxResults = clampMaxResults(options.maxResults);
  const maxChars = Math.max(400, options.maxCharsPerResult ?? DEFAULT_WEB_SEARCH_CONFIG.maxCharsPerResult);
  const body = buildExaSearchBody({ ...args, query }, maxResults, maxChars);

  const response = await fetch(EXA_SEARCH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(options.timeoutMs ?? DEFAULT_WEB_SEARCH_CONFIG.perCallTimeoutMs, options.signal),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Exa search error (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as ExaSearchResponse;
  const results = (payload.results ?? [])
    .filter((entry) => typeof entry?.url === "string" && entry.url.trim().length > 0)
    .slice(0, maxResults)
    .map((entry, index) => normalizeResult(entry, index, maxChars));

  return {
    query,
    results,
  };
}

export function sourceRecordFromResult(
  runId: string,
  modelId: string,
  stage: WebEnabledStage,
  query: string,
  result: SearchWebResultItem
): RetrievedSourceRecord {
  return {
    id: `${runId}_${stage}_${modelId}_${Buffer.from(result.url).toString("base64url").slice(0, 16)}`,
    stage,
    modelId,
    query,
    url: result.url,
    title: result.title,
    domain: result.domain,
    publishedDate: result.publishedDate,
    snippet: result.snippet,
    contentPreview: result.contentPreview,
    truncated: result.truncated,
    retrievedAt: new Date().toISOString(),
  };
}

export function formatPriorSourceSummary(records: RetrievedSourceRecord[]): string {
  if (records.length === 0) return "";

  return records
    .map((record, index) => {
      const snippet = record.snippet || record.contentPreview.slice(0, 220);
      return `${index + 1}. ${record.title || record.url}
URL: ${record.url}
Domain: ${record.domain || "unknown"}
Snippet: ${snippet}`.trim();
    })
    .join("\n\n");
}
