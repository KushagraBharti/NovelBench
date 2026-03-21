# Agent Guide

This repository is a live LLM creativity benchmark. If you are an agent reading this file, your job is to understand the benchmark pipeline quickly, make focused changes, and avoid breaking the run contract.

## Read This First

Read in this order:

1. `README.md` for the public-facing product shape.
2. `convex/_generated/ai/guidelines.md` for the Convex-specific rules that override generic habits.
3. `src/lib/categories.ts` for the domain taxonomy and output schemas.
4. `src/lib/models.ts` for the model roster and selection rules.
5. `src/lib/prompts.ts` and `src/lib/prompt-copy.ts` for the stage prompt contract.
6. `convex/schema.ts`, `convex/runs.ts`, and `convex/benchmarkWorkflow.ts` for the backend contract.
7. `convex/benchmarkActions.ts`, `convex/settings.ts`, and `convex/settingsActions.ts` for provider execution, BYOK, and policy logic.
8. `src/lib/structured-output.ts`, `src/lib/openrouter.ts`, and `src/lib/benchmark-web.ts` for parsing and provider behavior.
9. `src/components/arena` and `src/components/results` for the live UI and result views.
10. `docs/prompt-review-workbook.md` when changing prompt wording or stage behavior.
11. `src/lib/runtime-config.ts` for shared timeout/runtime limits before touching provider timing.

## What The App Does

NovelBench runs a four-stage competition over selected models:

1. Generate ideas for a category-specific prompt.
2. Critique and rank ideas anonymously.
3. Optionally accept human critique.
4. Revise, then run a final anonymous vote.

Runs are stored in Convex as compact summaries plus append-only events, participants, and artifacts, then replayed through the archive, results pages, and leaderboard.

## Technical Flow

The main path is:

`UI -> POST /api/benchmark -> Convex mutation -> Convex workflow/workpool -> OpenRouter and Exa -> Convex tables/file storage -> realtime queries -> results/archive/leaderboard`

Important implementation details:

- `src/app/arena/page.tsx` starts a run from the browser.
- `src/app/api/benchmark/route.ts` creates a run and queues it.
- `convex/runs.ts` defines run creation, access control, event queries, and policy enforcement.
- `convex/benchmarkWorkflow.ts` orchestrates the durable multi-stage run lifecycle.
- `convex/benchmarkActions.ts` executes provider calls, optional Exa search, and stage persistence.
- `src/hooks/useBenchmarkSSE.ts` is now a Convex-backed live run hook despite the legacy name.
- `src/lib/results.ts` aggregates archive and leaderboard data from saved runs.

## Repo Structure

- `src/app` - route segments, page entry points, loading states, and API routes.
- `src/components` - feature UI, result cards, controls, and shared primitives.
- `src/lib` - prompts, parsing, shared provider helpers, model catalog, results aggregation.
- `src/hooks` - client hooks for live Convex state and easter eggs.
- `src/types` - shared domain types and run shapes.
- `src/utils` - identity helpers and animation variants.
- `convex` - schema, auth, queries, mutations, actions, workflows, and backend helpers.
- `docs` - operational references for prompts and prompt review.

## Source Of Truth Files

If you need to understand or change behavior, these files are the source of truth:

- Category definitions: `src/lib/categories.ts`
- Model catalog and selection logic: `src/lib/models.ts`
- Shared stage copy: `src/lib/prompt-copy.ts`
- Prompt builders: `src/lib/prompts.ts`
- Prompt review reconstruction: `src/lib/prompt-review.ts`
- OpenRouter request shape and streaming: `src/lib/openrouter.ts`
- Retry timing and reasoning config: `src/lib/prompt-runtime.ts`
- Shared timeout/runtime constants: `src/lib/runtime-config.ts`
- Structured output repair: `src/lib/structured-output.ts`
- Shared web-search helpers: `src/lib/benchmark-web.ts`
- Run orchestration and access control: `convex/runs.ts`
- Workflow execution: `convex/benchmarkWorkflow.ts`
- Provider stage execution: `convex/benchmarkActions.ts`
- Storage format and indexes: `convex/schema.ts`

## Invariants To Preserve

Do not casually change these unless the task explicitly requires it:

- The run lifecycle stages and statuses in `src/types/index.ts`.
- The 2 to 8 model selection limit.
- Anonymous critique and vote labels.
- The JSON-first prompt contract for generate/critique/revise/vote.
- The Convex live state contract consumed by `useBenchmarkSSE`.
- The live trace experience for new runs: reasoning details, tool calls, exact source URLs, and streaming draft text must remain visible.
- Append-only run events, participants, and artifacts in Convex.
- Category IDs and their stable identity mapping.
- Model IDs and legacy aliases unless you are updating the catalog intentionally.
- Function-level org/project authorization and BYOK provider boundaries.
- The editorial dark visual language and page structure unless the task is a design rewrite.
- The shared timeout must come from `src/lib/runtime-config.ts`; do not fork per-surface timeout values.
- Runs should progress automatically through generate, critique, revise, and vote. Only the human critique checkpoint should wait for explicit user action.
- Archive pages are public-facing read surfaces and should stay separate from the live arena control shell.
- Workflow steps must not persist or return full live-event streams; keep workflow step inputs and outputs slim enough to stay well below Convex step-state limits.
- Avoid generic card grids, rounded pill controls, detached dashboard widgets, and utility chips unless the existing surface already uses them intentionally.

## Editing Rules

- Use Bun for scripts and package management.
- Use `apply_patch` for code edits.
- Prefer the smallest possible change that solves the problem.
- Do not revert user changes or unrelated edits.
- Do not touch generated directories like `.next/`, `.next-foundation/`, `node_modules/`, or `convex/_generated/`.
- If prompt wording changes, update the prompt review workbook or related prompt docs.
- If you change parsing or response shape, add or adjust tests in `src/lib/*.test.ts`.
- When editing frontend surfaces, use the `frontend-design` skill and match the existing editorial system from the landing, dashboard, arena, and leaderboard before inventing new UI primitives.
- Prefer hard edges, type hierarchy, rules, spacing, and grid rhythm over rounded cards, pills, badges, or floating control boxes.
- Keep exports, filters, and run controls integrated into the layout instead of tacking them on as isolated utility panels.
- When changing Convex workflows or actions, check for hot-document OCC issues and for payloads that could exceed Convex document or workflow-step size limits.
- If a fix is deployed directly to production Convex, commit and push the matching repo change immediately so the codebase and production do not drift.

## Working Style

- Start by tracing the actual runtime path instead of guessing.
- Use the browser or UI only when the change affects client behavior.
- Use local tests to confirm parsing, aggregation, workflow logic, policy enforcement, and model catalog rules.
- When you are uncertain about a contract, inspect the Convex schema, queries, and hydrated run shape before changing code.
- If a run appears stuck, inspect Convex workflow logs and workpool completion behavior before touching the UI.
- Treat `runs:getRunBundleInternal` as the rich UI/debug bundle and keep workflow-only queries slim and purpose-built.

## Regression Traps

- Do not remove or downgrade live reasoning/search trace persistence when touching benchmark execution. The trace path is part of the product, not optional debug output.
- Do not patch hot `runs` documents for high-frequency live token or reasoning updates unless absolutely necessary; append-only events are safer.
- Do not route archive detail pages through the live arena shell. Archive detail should be stable, readable, and public.
- Do not introduce local-only filtering if the server is already responsible for search/filter semantics.
- Do not “simplify” UI by falling back to generic cards or pills. This app uses an editorial interface language, not SaaS widgets.

## Practical Reading Order For Fast Onboarding

If you are trying to learn the repo quickly, this is the shortest path:

1. `README.md`
2. `src/lib/categories.ts`
3. `src/lib/models.ts`
4. `src/lib/prompts.ts`
5. `convex/schema.ts`
6. `convex/runs.ts`
7. `convex/benchmarkWorkflow.ts`
8. `convex/benchmarkActions.ts`
9. `src/app/arena/page.tsx`
10. `src/components/results/ResultsView.tsx`
11. `src/lib/results.ts`

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
