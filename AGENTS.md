# Agent Guide

This repo is a live Convex-backed LLM creativity benchmark. Read quickly, keep changes focused, and do not regress the product contract.

## Read First

1. `README.md`
2. `convex/_generated/ai/guidelines.md`
3. `src/lib/categories.ts`
4. `src/lib/models.ts`
5. `src/lib/prompts.ts` and `src/lib/prompt-copy.ts`
6. `src/lib/runtime-config.ts`
7. `convex/schema.ts`
8. `convex/runs.ts`
9. `convex/benchmarkWorkflow.ts`
10. `convex/benchmarkActions.ts`
11. `src/components/arena`
12. `src/components/results`

## Product Contract

NovelBench runs a four-stage benchmark:

1. generate
2. critique
3. optional human critique
4. revise and final vote

Runs are stored as compact summaries plus append-only participants, events, artifacts, jobs, and cached read models.

## Main Runtime Path

`UI -> POST /api/benchmark -> Convex mutation -> Convex workflow/workpool -> OpenRouter and Exa -> Convex tables/file storage -> realtime queries`

## Source Of Truth

- categories: `src/lib/categories.ts`
- model catalog: `src/lib/models.ts`
- prompts: `src/lib/prompts.ts`
- prompt copy: `src/lib/prompt-copy.ts`
- runtime limits/timeouts: `src/lib/runtime-config.ts`
- parsing/repair: `src/lib/structured-output.ts`
- web search helpers: `src/lib/benchmark-web.ts`
- run/query contract: `convex/runs.ts`
- workflow lifecycle: `convex/benchmarkWorkflow.ts`
- provider execution: `convex/benchmarkActions.ts`
- schema/indexes: `convex/schema.ts`

## Invariants

Do not casually break these:

- 2 to 8 model selection limit
- anonymous critique and vote labels
- JSON-first prompt contract
- append-only run events, participants, and artifacts
- public archive/detail surfaces
- live trace visibility for new runs: reasoning, tool calls, exact URLs, streaming draft text
- only the human critique checkpoint is intentionally manual
- shared timeout comes from `src/lib/runtime-config.ts`
- workflow step payloads must stay slim
- project/run/prompt public-default behavior
- BYOK provider boundaries and function-level access control

## Frontend Rules

- Use the existing editorial dark visual language.
- Match landing/dashboard/arena/archive/leaderboard before inventing anything new.
- Do not fall back to generic cards, pills, badges, or detached utility panels.
- Prefer type hierarchy, rules, spacing, hard edges, and grid rhythm.
- Keep exports, filters, and controls integrated into the layout.
- If doing real UI work, use the `frontend-design` skill.

## Backend Rules

- Convex is the source of truth.
- Prefer append-only events over patching hot docs for high-frequency live activity.
- Do not feed rich live-event streams into durable workflow state.
- Keep repo and prod in sync; if you deploy a direct Convex fix, commit it immediately after.
- Use shared job helpers instead of hand-rolled job status logic when adding async work.
- Keep archive/search/query semantics server-driven rather than split between server and client filtering.

## Working Style

- Trace the real runtime path before editing.
- Prefer the smallest correct change.
- Use Bun.
- Use `apply_patch` for code edits.
- Do not touch `.next/`, `.next-foundation/`, `node_modules/`, or generated output except `convex/_generated/` when Convex deploy/codegen updates it.
- If parsing or response shape changes, update tests in `src/lib/*.test.ts`.
- If prompt behavior changes, update the relevant prompt docs.

## Regression Traps

- Do not remove reasoning/search/live-token traces.
- Do not route archive detail through the live arena shell.
- Do not fork timeout values across callers.
- Do not reintroduce local-only filter semantics when the server owns the query contract.
- Do not reintroduce private-project assumptions into the public collaboration product.

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->
