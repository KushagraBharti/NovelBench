# NovelBench

LLM Creativity Benchmark — have AI models generate ideas, critique each other, revise, and vote to find the most creative LLM.

## How It Works

1. **Generate** — 4 models (GPT-5 Mini, Claude Haiku 4.5, Gemini 3 Flash, Grok 4.1 Fast) generate creative ideas from your prompt
2. **Critique & Vote (Round 1)** — Each model critiques and ranks all other ideas
3. **Revise** — Models improve their ideas based on the critiques they received
4. **Final Vote (Round 2)** — Models rank the revised ideas for final standings

## Benchmarks

- **Venture** — Startup concepts and business models
- **Frontier** — Research proposals and scientific hypotheses
- **Story** — Creative writing, fiction premises, and narrative concepts
- **Cinema** — Movie pitches, screenplays, and film loglines
- **Folio** — Book ideas, novel premises, and plot structures
- **Canvas** — Art directions, game worlds, and album themes
- **Stage** — Theater, musicals, and live performance concepts
- **Blueprint** — Inventions and engineering concepts

## Setup

```bash
# Install dependencies
bun install

# Copy env file and add your OpenRouter API key
cp .env.example .env.local

# Run the dev server
bun run dev
```

Get your OpenRouter API key at [openrouter.ai/keys](https://openrouter.ai/keys).

## Tech Stack

- **Next.js** (App Router, TypeScript)
- **Bun** (package manager)
- **OpenRouter** (unified LLM API)
- **Tailwind CSS** (styling)
- **Local JSON files** (storage, no database)
