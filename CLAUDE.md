# CLAUDE.md — Kuwait Gov Info Chatbot (hackathon MVP)

## What this project is
A bilingual (Arabic/English) chatbot that answers questions about Kuwaiti government services and rules, using only official sources:
- **Website services** (standing rules: requirements, fees, steps) from `data/services.json`
- **Official X posts** (updates: new decisions, changes, clarifications) pulled via the X API

Every answer cites its sources (entity, date, link). If the sources don't answer the question, the bot says so.

Read `MVP-SPEC.md` for the full spec and `implementation-plan.md` for the build order. Follow the plan phase by phase and stop at each checkpoint to confirm it works.

## Stack
- Node 20+, npm workspaces: `server/` (Express, ESM) and `client/` (React + Vite + Tailwind)
- `@anthropic-ai/sdk` for all LLM calls (server side only)
- X API v2 via native `fetch` (no X SDK)
- `cheerio` for website loading
- No database. JSON files in `data/`. In-memory BM25 search.

## Commands
- `npm install` — install all workspaces
- `npm run dev` — run server (port 3001) and client (port 5173) together
- `npm run ingest:x` — one budget-capped X poll → `data/posts.json`
- `npm run classify` — label new posts → `data/posts_clean.json`
- `npm run build:knowledge` — merge services + clean posts → `data/knowledge.json`

## Hard rules
1. **API keys never reach the client.** All Anthropic and X calls go through the Express server. Keys come from `.env` only.
2. **Never invent government data.** No placeholder fees, rules or posts in code or seed data. If sample data is needed, use the real PACI example in `data/services.sample.json`.
3. **Respect robots.txt.** The website loader only fetches sites in `config/sites.json` with `mode: "fetch"` or `"follow_links"`. Sites with `mode: "manual"` are read from `manual/` files only.
4. **X API budget guard is mandatory.** Port the logic in `reference/x_source.py` exactly: cached user IDs, per-account `since_id`, no `author_id` expansion, `exclude=retweets,replies`, local spend cap, fixture fallback.
5. **Keep it MVP.** No auth, no database, no vector DB, no OCR, no deployment work unless the plan says so. Ask before adding dependencies not listed in the spec.

## Docs
- Use **Context7** for library docs (`@anthropic-ai/sdk`, express, react, vite, tailwind, cheerio) before writing code that uses them.
- For the X API, check https://docs.x.com (endpoints and pricing change often).
- Model names come from env vars (`CHAT_MODEL`, `FAST_MODEL`). Don't hard-code them; confirm current model IDs in the Anthropic docs if a call fails.

## Code conventions
- ESM (`import`), async/await, small modules in `server/src/lib/`.
- Every knowledge item uses the unified `KnowledgeItem` shape defined in `MVP-SPEC.md`.
- Parse every LLM JSON response defensively: strip code fences, `JSON.parse` in try/catch, fall back to a safe default and log the raw text.
- UI text and messages use `dir="auto"` so Arabic renders right-to-left.
- Log, don't crash: one failing account, page or LLM call must not stop the whole run.

## Prompts
LLM prompts live in `prompts/*.md` and are loaded at runtime. Edit prompts there, not inline in code.

## Definition of done (MVP)
The 6 demo questions in `MVP-SPEC.md` give correct, cited answers in the UI, the "Check for new announcements" button works (or falls back to fixtures cleanly), and spend is shown.
