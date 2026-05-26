/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as app from "../app.js";
import type * as auth from "../auth.js";
import type * as benchmarkActions from "../benchmarkActions.js";
import type * as benchmarkWorkflow from "../benchmarkWorkflow.js";
import type * as crons from "../crons.js";
import type * as diagnostics from "../diagnostics.js";
import type * as exportActions from "../exportActions.js";
import type * as exports from "../exports.js";
import type * as http from "../http.js";
import type * as leaderboards from "../leaderboards.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_exa from "../lib/exa.js";
import type * as lib_jobs from "../lib/jobs.js";
import type * as lib_leaderboard from "../lib/leaderboard.js";
import type * as lib_leaderboardV2 from "../lib/leaderboardV2.js";
import type * as lib_openrouter from "../lib/openrouter.js";
import type * as lib_policies from "../lib/policies.js";
import type * as lib_runBandwidth from "../lib/runBandwidth.js";
import type * as lib_runHelpers from "../lib/runHelpers.js";
import type * as migrationActions from "../migrationActions.js";
import type * as migrations from "../migrations.js";
import type * as projects from "../projects.js";
import type * as runs from "../runs.js";
import type * as settings from "../settings.js";
import type * as settingsActions from "../settingsActions.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  app: typeof app;
  auth: typeof auth;
  benchmarkActions: typeof benchmarkActions;
  benchmarkWorkflow: typeof benchmarkWorkflow;
  crons: typeof crons;
  diagnostics: typeof diagnostics;
  exportActions: typeof exportActions;
  exports: typeof exports;
  http: typeof http;
  leaderboards: typeof leaderboards;
  "lib/auth": typeof lib_auth;
  "lib/constants": typeof lib_constants;
  "lib/crypto": typeof lib_crypto;
  "lib/exa": typeof lib_exa;
  "lib/jobs": typeof lib_jobs;
  "lib/leaderboard": typeof lib_leaderboard;
  "lib/leaderboardV2": typeof lib_leaderboardV2;
  "lib/openrouter": typeof lib_openrouter;
  "lib/policies": typeof lib_policies;
  "lib/runBandwidth": typeof lib_runBandwidth;
  "lib/runHelpers": typeof lib_runHelpers;
  migrationActions: typeof migrationActions;
  migrations: typeof migrations;
  projects: typeof projects;
  runs: typeof runs;
  settings: typeof settings;
  settingsActions: typeof settingsActions;
  workflow: typeof workflow;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  exportsWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"exportsWorkpool">;
};
