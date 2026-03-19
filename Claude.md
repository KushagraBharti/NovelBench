# Claude Guide

This repository is a live LLM creativity benchmark. If you are Claude or another code-focused agent, use this file as the fast path to understanding how the codebase works and what must stay stable.

## Read This First

Read in this order:

1. `README.md` for the public-facing product shape.
2. `src/lib/categories.ts` for the domain taxonomy and output schemas.
3. `src/lib/models.ts` for the model roster and selection rules.
4. `src/lib/prompts.ts` and `src/lib/prompt-copy.ts` for the stage prompt contract.
5. `src/lib/engine.ts` for the execution pipeline.
6. `src/lib/storage.ts` and `src/lib/run-scheduler.ts` for persistence and orchestration.
7. `src/lib/structured-output.ts` and `src/lib/openrouter.ts` for parsing and API behavior.
8. `src/components/arena` and `src/components/results` for the live UI and result views.
9. `docs/prompt-review-workbook.md` when changing prompt wording or stage behavior.

## What The App Does

NovelBench runs a four-stage competition over selected models:

1. Generate ideas for a category-specific prompt.
2. Critique and rank ideas anonymously.
3. Optionally accept human critique.
4. Revise, then run a final anonymous vote.

Runs are stored as local JSON files and replayed through the archive, results pages, and leaderboard.

## Technical Flow

The main path is:

`UI -> POST /api/benchmark -> run scheduler -> engine -> OpenRouter -> storage -> SSE updates -> results/archive/leaderboard`

Important implementation details:

- `src/app/arena/page.tsx` starts a run from the browser.
- `src/app/api/benchmark/route.ts` creates a run and queues it.
- `src/lib/run-scheduler.ts` manages queueing, resumption, cancellation, and retry.
- `src/lib/engine.ts` executes the benchmark stage by stage.
- `src/app/api/benchmark/[id]/events/route.ts` streams progress and token chunks to the client.
- `src/lib/storage.ts` persists runs to `data/runs/*.json`.
- `src/lib/results.ts` aggregates archive and leaderboard data from saved runs.

## Repo Structure

- `src/app` - route segments, page entry points, loading states, and API routes.
- `src/components` - feature UI, result cards, controls, and shared primitives.
- `src/lib` - benchmark core, persistence, prompt building, parsing, model catalog, results aggregation.
- `src/hooks` - client hooks for SSE and easter eggs.
- `src/types` - shared domain types and run shapes.
- `src/utils` - identity helpers and animation variants.
- `docs` - operational references for prompts and prompt review.
- `data/runs` - persisted benchmark runs.

## Source Of Truth Files

If you need to understand or change behavior, these files are the source of truth:

- Category definitions: `src/lib/categories.ts`
- Model catalog and selection logic: `src/lib/models.ts`
- Shared stage copy: `src/lib/prompt-copy.ts`
- Prompt builders: `src/lib/prompts.ts`
- Prompt review reconstruction: `src/lib/prompt-review.ts`
- OpenRouter request shape and streaming: `src/lib/openrouter.ts`
- Retry timing and reasoning config: `src/lib/prompt-runtime.ts`
- Structured output repair: `src/lib/structured-output.ts`
- Run orchestration: `src/lib/run-scheduler.ts`
- Execution engine: `src/lib/engine.ts`
- Storage format: `src/lib/storage.ts`

## Invariants To Preserve

Do not casually change these unless the task explicitly requires it:

- The run lifecycle stages and statuses in `src/types/index.ts`.
- The 2 to 8 model selection limit.
- Anonymous critique and vote labels.
- The JSON-first prompt contract for generate/critique/revise/vote.
- The SSE event contract used by `useBenchmarkSSE`.
- File-based run persistence in `data/runs`.
- Category IDs and their stable identity mapping.
- Model IDs and legacy aliases unless you are updating the catalog intentionally.
- The editorial dark visual language and page structure unless the task is a design rewrite.

## Editing Rules

- Use Bun for scripts and package management.
- Use `apply_patch` for code edits.
- Prefer the smallest possible change that solves the problem.
- Do not revert user changes or unrelated edits.
- Do not touch generated directories like `.next/` or `node_modules/`.
- Do not commit `data/` contents unless the task explicitly asks for persisted sample data.
- If prompt wording changes, update the prompt review workbook or related prompt docs.
- If you change parsing or response shape, add or adjust tests in `src/lib/*.test.ts`.

## Working Style

- Start by tracing the actual runtime path instead of guessing.
- Use the browser or UI only when the change affects client behavior.
- Use local tests to confirm parsing, aggregation, scheduler logic, and model catalog rules.
- When you are uncertain about a contract, inspect the existing run JSON in `data/runs` before changing code.

## Practical Reading Order For Fast Onboarding

If you are trying to learn the repo quickly, this is the shortest path:

1. `README.md`
2. `src/lib/categories.ts`
3. `src/lib/models.ts`
4. `src/lib/prompts.ts`
5. `src/lib/engine.ts`
6. `src/lib/run-scheduler.ts`
7. `src/lib/storage.ts`
8. `src/app/arena/page.tsx`
9. `src/components/results/ResultsView.tsx`
10. `src/lib/results.ts`
