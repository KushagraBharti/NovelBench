# NovelBench

NovelBench is an LLM creativity benchmark built as a live arena. Multiple models are put through the same prompt, asked to generate ideas, critique each other anonymously, revise their work, and then vote on the result. The goal is not just to see who can answer a prompt. The goal is to find which model can do creative work well under competition, feedback, and revision pressure.

The app is intentionally opinionated:

- It treats creativity as a process, not a single completion.
- It separates domain knowledge from the scoring pipeline.
- It keeps every run inspectable after the fact.
- It stores operational data in Convex and large artifacts in Convex file storage.
- It is designed to be durable, replayable, and easy to extend.

## What NovelBench Does

- Collects a user prompt in one of eight creative domains.
- Runs a configurable roster of OpenRouter-backed models.
- Optionally lets eligible stages use Exa-backed web search when project policy allows it.
- Has each model generate a structured idea.
- Has models critique one another anonymously.
- Lets models revise their own ideas using the critiques they received.
- Runs a final anonymous vote over the revised ideas.
- Stores append-only run state, events, and artifacts for replay, archive browsing, and leaderboard aggregation.

## Why It Exists

Most benchmark setups ask a model for one answer and score the first response. NovelBench instead measures a more realistic creative workflow:

- Can the model produce something novel?
- Can it judge other work fairly when identity is hidden?
- Can it incorporate critique without collapsing into generic revision?
- Can it still win after the work has been improved and re-ranked?

That makes it useful for evaluating frontier models, fast models, and custom OpenRouter models in a single shared arena.

## Creative Domains

Each run happens in one domain. The current taxonomy is:

- Venture
- Frontier
- Story
- Cinema
- Folio
- Canvas
- Stage
- Blueprint

Each domain has:

- a category-specific system prompt
- evaluation criteria
- a structured output schema
- example prompts for quick starts

## How The Benchmark Works

1. **Generate**
   - The selected models receive the same user prompt plus the domain prompt.
   - Each model returns structured JSON for its idea.
   - If research is enabled for the project and the user has provided an Exa key, supported models can issue bounded web-search tool calls during idea generation.

2. **Critique and rank**
   - Every model critiques the other ideas anonymously.
   - It also ranks all ideas, including its own.
   - The app normalizes malformed JSON aggressively so a run can continue when a model outputs something close to the requested format.

3. **Optional human critique**
   - If the run reaches the human critique checkpoint, the user can add their own notes.
   - Those human critiques are folded into the revision prompt for the affected ideas.

4. **Revise**
   - Each surviving model revises its own idea using the critiques it received.
   - If research is enabled, supported models can also use Exa during revision.
   - Revised ideas are stored separately from the originals.

5. **Final vote**
   - The revised ideas are ranked again, anonymously.
   - Final standings are computed from the aggregated judge rankings.
   - The winner reveal uses the final average rank.

## Core Mechanics

- **OpenRouter is the model gateway.** Model generation, critique, revision, and voting run through user-provided OpenRouter credentials.
- **Exa is the research gateway.** Web search is optional, policy-controlled, and uses user-provided Exa credentials.
- **Runs are Convex-backed.** Run summaries, participants, stage state, policies, budgets, usage, and analytics live in Convex tables.
- **Large payloads live in object storage.** Search payloads, exports, and other large artifacts are stored in Convex file storage.
- **Execution is durable.** Convex Workflow and bounded work pools coordinate benchmark stages instead of relying on an in-process scheduler.
- **Progress is realtime.** The UI subscribes to Convex queries for live run state instead of consuming an SSE route.
- **Trace visibility is part of the product.** New runs should preserve reasoning details, tool calls, exact cited URLs, and live draft streaming where supported.
- **Prompt generation is centralized.** Shared stage copy lives in `src/lib/prompt-copy.ts`, while the prompt builder logic lives in `src/lib/prompts.ts`.
- **Structured output is defensive.** The app tries to recover from fenced JSON, truncated JSON, and lightly malformed model output.
- **Anonymous labels are stable per stage.** Judges see labels like A, B, C, not model names.
- **The leaderboard is cached derived data.** It is updated from completed runs and served from Convex read models.
- **BYOK is enforced.** Users bring their own OpenRouter and Exa keys, which are stored encrypted server-side.

## Implementation Guardrails

- **One timeout source of truth.** Runtime/provider timeout configuration should come from `src/lib/runtime-config.ts`, not scattered per caller.
- **Workflow state must stay small.** Convex workflow steps should pass IDs and compact summaries, not full event streams or live trace payloads.
- **Automatic stage progression is expected.** Runs should advance automatically through generate, critique, revise, and final vote. Only the human critique checkpoint is intentionally user-gated.
- **Archive is a public read surface.** Archive pages and archive detail should remain stable, public-facing views, separate from the live arena control shell.
- **The UI language is editorial, not SaaS.** Favor typography, spacing, rules, and hard-edged modules over rounded cards, pills, floating badges, and detached utility panels.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Convex database, auth, file storage, and workflows
- OpenRouter API
- Exa API
- Bun for package management and scripts

## Repository Layout

- `src/app` - routes, pages, route handlers, and loading states
- `src/components` - page sections, widgets, result views, and UI primitives
- `src/lib` - prompts, shared web-search helpers, OpenRouter client, and results aggregation
- `src/hooks` - client hooks for Convex-backed live state and easter eggs
- `src/types` - shared type definitions
- `src/utils` - identity helpers and animation variants
- `convex` - backend schema, auth, queries, mutations, actions, workflows, and policy helpers
- `docs` - prompt review and prompt-writing references

## Development Setup

Use Bun only.

1. Install dependencies:

```bash
bun install
```

2. Create your environment file from the example and add the Convex and auth settings needed for local development:

```text
NEXT_PUBLIC_CONVEX_URL=https://glorious-moose-513.convex.cloud
AUTH_SECRET=your_auth_secret
```

3. Start the dev server:

```bash
bun run dev
```

## Useful Scripts

- `bun run dev` - start the app locally
- `bun run build` - production build
- `bun run start` - run the production server
- `bun run lint` - run lint checks
- `bun run test` - run the Vitest suite
- `bunx convex codegen` - regenerate Convex types
- `bunx convex deploy -y` - deploy to the production Convex backend

## Environment

The app requires local Convex/auth configuration to boot the web app. Provider credentials are BYOK and are stored through the in-app settings flow instead of being shared as global server keys.

Typical app variables include:

- `NEXT_PUBLIC_CONVEX_URL`
- `AUTH_SECRET`
- GitHub OAuth credentials

Convex production variables are managed separately in Convex:

- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `PROVIDER_VAULT_MASTER_KEY`
- `LEGACY_MIGRATION_SECRET`

## Notes

- The archive and leaderboard are driven by Convex read models, not by scanning local files.
- Legacy benchmark files can be imported into the Convex run/event/artifact model through a migration path.
- The current model catalog in code is the source of truth; the README may lag if the catalog changes.
- Prompt behavior is centralized and reviewed separately so it can be changed without rewriting the workflow.
- If a production Convex fix is deployed directly, the corresponding repo change should be committed immediately so the repo and deployment stay in sync.
