# NovelBench

NovelBench is an LLM creativity benchmark built as a live arena. Multiple models are put through the same prompt, asked to generate ideas, critique each other anonymously, revise their work, and then vote on the result. The goal is not just to see who can answer a prompt. The goal is to find which model can do creative work well under competition, feedback, and revision pressure.

The app is intentionally opinionated:

- It treats creativity as a process, not a single completion.
- It separates domain knowledge from the scoring pipeline.
- It keeps every run inspectable after the fact.
- It uses local JSON storage instead of a database.
- It is designed to be understandable, reproducible, and easy to extend.

## What NovelBench Does

- Collects a user prompt in one of eight creative domains.
- Runs a configurable roster of OpenRouter-backed models.
- Has each model generate a structured idea.
- Has models critique one another anonymously.
- Lets models revise their own ideas using the critiques they received.
- Runs a final anonymous vote over the revised ideas.
- Stores the full run locally for replay, archive browsing, and leaderboard aggregation.

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
   - Generation is streamed so the UI can show live text as it arrives.

2. **Critique and rank**
   - Every model critiques the other ideas anonymously.
   - It also ranks all ideas, including its own.
   - The app normalizes malformed JSON aggressively so a run can continue when a model outputs something close to the requested format.

3. **Optional human critique**
   - If the run reaches the human critique checkpoint, the user can add their own notes.
   - Those human critiques are folded into the revision prompt for the affected ideas.

4. **Revise**
   - Each surviving model revises its own idea using the critiques it received.
   - Revision is streamed.
   - Revised ideas are stored separately from the originals.

5. **Final vote**
   - The revised ideas are ranked again, anonymously.
   - Final standings are computed from the aggregated judge rankings.
   - The winner reveal uses the final average rank.

## Core Mechanics

- **OpenRouter is the only model gateway.** The app does not call providers directly.
- **Runs are file-backed.** Each run lives in `data/runs/<run-id>.json`.
- **The scheduler is in-process.** It queues benchmark execution, supports resumption, and keeps abort controllers per stage.
- **Progress is pushed over SSE.** The UI listens to `/api/benchmark/[id]/events` for live status and token streams.
- **Prompt generation is centralized.** Shared stage copy lives in `src/lib/prompt-copy.ts`, while the prompt builder logic lives in `src/lib/prompts.ts`.
- **Structured output is defensive.** The app tries to recover from fenced JSON, truncated JSON, and lightly malformed model output.
- **Anonymous labels are stable per stage.** Judges see labels like A, B, C, not model names.
- **The leaderboard is derived data.** It is computed from stored runs, not written by hand.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- OpenRouter API
- Bun for package management and scripts
- Local JSON files for persistence

## Repository Layout

- `src/app` - routes, pages, route handlers, and loading states
- `src/components` - page sections, widgets, result views, and UI primitives
- `src/lib` - benchmark engine, prompts, storage, OpenRouter client, results aggregation
- `src/hooks` - client hooks for SSE and easter eggs
- `src/types` - shared type definitions
- `src/utils` - identity helpers and animation variants
- `data/runs` - persisted benchmark runs
- `docs` - prompt review and prompt-writing references

## Development Setup

Use Bun only.

1. Install dependencies:

```bash
bun install
```

2. Create your environment file from the example and add your OpenRouter key:

```text
OPENROUTER_API_KEY=your_openrouter_api_key_here
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

## Environment

The app requires:

- `OPENROUTER_API_KEY`

If the key is missing, model calls fail immediately.

## Notes

- The archive and leaderboard are driven by whatever is already in `data/runs`.
- Legacy benchmark files can still be migrated from `data/` into `data/runs/`.
- The current model catalog in code is the source of truth; the README may lag if the catalog changes.
- Prompt behavior is centralized and reviewed separately so it can be changed without rewriting the benchmark engine.
