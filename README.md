# Socrates

A private workspace for learning, thinking and changing your mind. Organize what you know by subject, debate a position, spot contradictions, and turn what you learn into revision cards.

This repository contains the full application code. It contains **no user notes, opinions, debate transcripts, reading history, API keys or database**. Those stay in the ignored local `data/` directory.

## What it does

- Keeps dossiers with facts, arguments, questions and an evolving position.
- Runs guided lessons and debates with an AI assistant.
- Finds possible contradictions between dossiers.
- Turns notes and source material into revision cards.
- Imports a YouTube transcript into a subject for later study.
- Backs up the local SQLite database with `npm run backup`.

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS, SQLite via `better-sqlite3`, and the Anthropic SDK. The default AI backend uses a local authenticated Claude Code session; `LLM_BACKEND=api` switches to the Anthropic API. The application works without AI configuration for manual notes and browsing.

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. To use AI features, install and authenticate Claude Code, or set `LLM_BACKEND=api` and `ANTHROPIC_API_KEY` in `.env.local`. Keep the app on a trusted local machine unless you add your own authentication layer.

## Project structure

- `app/` — pages, actions and API routes
- `components/` — the learning interface
- `lib/db.ts` — local SQLite schema and queries
- `lib/ai.ts` and `lib/llm.ts` — debate, analysis and model orchestration
- `scripts/backup.mjs` — local backups, also ignored by Git

The application code is available under the MIT license.
