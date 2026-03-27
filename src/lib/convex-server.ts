import { fetchMutation, fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { unstable_cache } from "next/cache";
import { api } from "../../convex/_generated/api";
import { categories } from "./categories";
import type {
  ArchivePageData,
  BenchmarkRun,
  BenchmarkRunSummary,
  HumanCritiqueEntry,
  LeaderboardData,
  LeaderboardVotePhase,
  RunExportEntry,
} from "@/types";

async function authOptions() {
  const token = await convexAuthNextjsToken();
  return token ? { token } : {};
}

function isTerminalStatus(status: BenchmarkRun["status"]) {
  return (
    status === "complete" ||
    status === "partial" ||
    status === "canceled" ||
    status === "dead_lettered" ||
    status === "error"
  );
}

export async function fetchRun(runId: string): Promise<BenchmarkRun | null> {
  return fetchQuery(api.runs.get, { runId: runId as never }, await authOptions());
}

export interface ArchiveFilters {
  query?: string;
  organizationId?: string;
  projectId?: string;
  categoryId?: string;
  status?: string;
  visibility?: "private" | "org_shared" | "public" | "public_full";
  createdAfter?: number;
  createdBefore?: number;
  cursor?: string | null;
  numItems?: number;
}

export async function fetchArchivePage(filters: ArchiveFilters = {}): Promise<ArchivePageData> {
  const paginationOpts = {
    numItems: Math.min(Math.max(filters.numItems ?? 25, 1), 50),
    cursor: filters.cursor ?? null,
  };

  if (filters.query?.trim()) {
    return (await fetchQuery(
      api.runs.search,
      {
        query: filters.query.trim(),
        organizationId: filters.organizationId as never,
        projectId: filters.projectId as never,
        paginationOpts,
        categoryId: filters.categoryId || undefined,
        status: filters.status || undefined,
        visibility: filters.visibility,
        createdAfter: filters.createdAfter,
        createdBefore: filters.createdBefore,
      },
      await authOptions(),
    )) as ArchivePageData;
  }

  return (await fetchQuery(
    api.runs.list,
    {
      organizationId: filters.organizationId as never,
      projectId: filters.projectId as never,
      paginationOpts,
      categoryId: filters.categoryId || undefined,
      status: filters.status || undefined,
      visibility: filters.visibility,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
    },
    await authOptions(),
  )) as ArchivePageData;
}

export async function fetchArchiveSummaries(): Promise<BenchmarkRunSummary[]> {
  const results: BenchmarkRunSummary[] = [];
  let cursor: string | null = null;

  while (true) {
    const page = await fetchArchivePage({
      cursor,
      numItems: 50,
    });
    results.push(...page.page);
    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }

  return results;
}

export async function fetchLeaderboardData(
  votePhase: LeaderboardVotePhase = "final",
): Promise<LeaderboardData> {
  return fetchLeaderboardDataCached(votePhase);
}

const fetchLeaderboardDataCached = unstable_cache(
  async (votePhase: LeaderboardVotePhase): Promise<LeaderboardData> => {
    const global = await fetchQuery(api.leaderboards.get, { votePhase });
    const byCategoryEntries = await Promise.all(
      categories.map(async (category) => {
        const snapshot = await fetchQuery(api.leaderboards.get, {
          categoryId: category.id,
          votePhase,
        });
        return [
          category.id,
          {
            entries: snapshot.entries,
            metadata: snapshot.metadata,
            totals: snapshot.totals,
          },
        ] as const;
      }),
    );
    return {
      votePhase,
      global: global.entries,
      byCategory: Object.fromEntries(
        byCategoryEntries.map(([categoryId, snapshot]) => [categoryId, snapshot.entries]),
      ),
      insights: global.metadata ?? {
        featuredMatchups: [],
        coverageGaps: [],
      },
      byCategoryInsights: Object.fromEntries(
        byCategoryEntries.map(([categoryId, snapshot]) => [
          categoryId,
          snapshot.metadata ?? {
            featuredMatchups: [],
            coverageGaps: [],
          },
        ]),
      ),
      categoryTotals: Object.fromEntries(
        byCategoryEntries.map(([categoryId, snapshot]) => [categoryId, snapshot.totals]),
      ),
      totals: global.totals,
    };
  },
  ["leaderboard-data"],
  { revalidate: 60 },
);

const fetchPublicTerminalRunCached = unstable_cache(
  async (runId: string): Promise<BenchmarkRun | null> => {
    const run = await fetchQuery(api.runs.get, { runId: runId as never });
    if (!run) {
      return null;
    }
    if (!isTerminalStatus(run.status)) {
      return null;
    }
    if (run.exposureMode !== "public" && run.exposureMode !== "public_full") {
      return null;
    }
    return run;
  },
  ["public-terminal-run"],
  { revalidate: 300 },
);

const fetchAuthenticatedTerminalRunCached = unstable_cache(
  async (runId: string, token: string): Promise<BenchmarkRun | null> => {
    const run = await fetchQuery(api.runs.get, { runId: runId as never }, { token });
    if (!run || !isTerminalStatus(run.status)) {
      return null;
    }
    return run;
  },
  ["authenticated-terminal-run"],
  { revalidate: 60 },
);

export async function fetchArchiveDetailRun(runId: string): Promise<BenchmarkRun | null> {
  const cached = await fetchPublicTerminalRunCached(runId);
  if (cached) {
    return cached;
  }
  const token = await convexAuthNextjsToken();
  if (token) {
    const authenticatedCached = await fetchAuthenticatedTerminalRunCached(runId, token);
    if (authenticatedCached) {
      return authenticatedCached;
    }
  }
  return fetchRun(runId);
}

export async function createBenchmarkRun(input: {
  categoryId: string;
  prompt: string;
  selectedModelIds: string[];
  customModelIds: string[];
}): Promise<BenchmarkRun> {
  return fetchMutation(api.runs.create, input, await authOptions());
}

export async function pauseBenchmarkRunServer(runId: string, reason?: string) {
  return fetchMutation(api.runs.pause, { runId: runId as never, reason }, await authOptions());
}

export async function resumeBenchmarkRunServer(runId: string) {
  return fetchMutation(api.runs.resume, { runId: runId as never }, await authOptions());
}

export async function proceedBenchmarkRunServer(runId: string) {
  return fetchMutation(api.runs.proceed, { runId: runId as never }, await authOptions());
}

export async function cancelBenchmarkRunServer(runId: string, reason?: string) {
  return fetchMutation(api.runs.cancel, { runId: runId as never, reason }, await authOptions());
}

export async function submitHumanCritiquesServer(
  runId: string,
  critiques: Omit<HumanCritiqueEntry, "id" | "timestamp">[],
) {
  return fetchMutation(
    api.runs.submitHumanCritiques,
    {
      runId: runId as never,
      critiques,
    },
    await authOptions(),
  );
}

export async function restartBenchmarkRunServer(runId: string) {
  const run = await fetchRun(runId);
  if (!run) {
    throw new Error("Run not found");
  }

  return createBenchmarkRun({
    categoryId: run.categoryId,
    prompt: run.prompt,
    selectedModelIds: run.selectedModels.map((model) => model.id),
    customModelIds: run.selectedModels
      .filter((model) => model.id.startsWith("custom-"))
      .map((model) => model.openRouterId),
  });
}

export async function requestRunExportServer(runId: string, format: "json" | "csv") {
  return fetchMutation(
    api.exports.requestRunExport,
    { runId: runId as never, format },
    await authOptions(),
  ) as Promise<RunExportEntry>;
}

export async function listRunExportsServer(runId: string) {
  return fetchQuery(
    api.exports.listByRun,
    { runId: runId as never },
    await authOptions(),
  ) as Promise<RunExportEntry[]>;
}

export async function requestProjectSummaryExportServer(projectId: string, format: "json" | "csv") {
  return fetchMutation(
    api.exports.requestProjectSummaryExport,
    { projectId: projectId as never, format },
    await authOptions(),
  ) as Promise<RunExportEntry>;
}

export async function listProjectExportsServer(projectId: string) {
  return fetchQuery(
    api.exports.listByProject,
    { projectId: projectId as never },
    await authOptions(),
  ) as Promise<RunExportEntry[]>;
}

export async function requestLeaderboardExportServer(
  format: "json" | "csv",
  categoryId?: string,
  votePhase?: LeaderboardVotePhase,
) {
  return fetchMutation(
    api.exports.requestLeaderboardExport,
    { format, categoryId, votePhase },
    await authOptions(),
  ) as Promise<RunExportEntry>;
}

export async function listLeaderboardExportsServer(
  categoryId?: string,
  votePhase?: LeaderboardVotePhase,
) {
  return fetchQuery(
    api.exports.listLeaderboard,
    { categoryId, votePhase },
    await authOptions(),
  ) as Promise<RunExportEntry[]>;
}
