# Implementation Plan

Two parts: **Prep (today)** gets everything running so that **Build day (5 hours)** is only about data, quality and the demo.
Claude Code: do one phase at a time, run the checkpoint, and report before moving on.

---

## PREP (today, before the hackathon)

> First confirm the hackathon allows code written before the event. If it doesn't, use Prep only for accounts, keys, data collection and planning, and run Phases 1–5 on the day.

### P0 — Accounts and keys (human, ~30 min)
- [ ] Anthropic API key → `.env`
- [ ] X developer account, smallest credit pack, **spending limit set in console.x.com** → bearer token in `.env`
- [ ] Context7 installed in Claude Code (`npx ctx7 setup --claude`), checked with `/mcp`
- [ ] Verify each handle in `config/accounts.json` on X (grey government check mark) and fill in the TODO entries from each entity's official website

### P1 — Scaffold (Claude Code, ~30 min)
- npm workspaces root with `server/` (Express, ESM) and `client/` (Vite React + Tailwind)
- Root scripts: `dev` (both, via `concurrently`), `ingest:x`, `classify`, `build:knowledge`
- `server/src/lib/prompts.js` loads `prompts/*.md`; `claude.js` wraps the SDK with a `callJSON(model, system, user)` helper (fence stripping + safe parse)
- **Checkpoint:** `npm run dev` shows the React page; `GET /api/stats` returns JSON.

### P2 — X ingestion (Claude Code, ~45 min)
- Port `reference/x_source.py` to `server/src/lib/xSource.js` exactly (see spec §8)
- `scripts/ingest-x.js` runs `pollOnce()` and appends new posts to `data/posts.json` (dedupe by id)
- **Checkpoint:** with no token → falls back to fixtures cleanly. With token → fetches posts from 1 account, `state.json` shows IDs, `since_id` and estimated spend. Run it twice: second run fetches only new posts.

### P3 — Classification + knowledge build (Claude Code, ~45 min)
- `classify.js` + script (spec §9), writes `data/posts_clean.json`
- `knowledge.js` + `build-knowledge.js`: services + clean posts → `knowledge.json` (spec §5.3, §7.4)
- Until the friend's data arrives, use `data/services.sample.json`
- **Checkpoint:** `knowledge.json` contains website and X items with correct `promptText`; arrest/condolence posts are dropped.

### P4 — Search + chat endpoint (Claude Code, ~1 h)
- `search.js`: Arabic normalization + BM25 (spec §6); query expansion with `prompts/query-expand.md`
- `POST /api/chat` (spec §7.1) with `prompts/chat-system.md`
- **Checkpoint:** curl an Arabic and an English question about the PACI sample → same correct answer and source; an unrelated question → `not_found`.

### P5 — UI (Claude Code, ~1–1.5 h)
- Components per spec §10. RTL via `dir="auto"`. Source cards, change notice, not-found style, disclaimer, suggested questions, AdminBar with spend.
- **Checkpoint:** full flow in the browser; "Check for new announcements" works and shows spend.

**End of prep:** working app on sample data. Commit.

---

## BUILD DAY (5 hours)

| Time | Task | Done when |
|---|---|---|
| 0:00–0:45 | **Load real data.** Merge the friend's `services.json` files, spot-check 5–10 services against the original pages (fees, ages, conditions). Run `ingest:x` → `classify` → `build:knowledge`. Put 10–20 good posts in `fixtures.json` as backup. | `knowledge.json` has real services + posts |
| 0:45–1:45 | **Answer quality.** Write the 6 demo questions (spec §12) using real data. Run each; fix prompts/search until all pass. | All 6 pass |
| 1:45–2:45 | **Optional extras (only if 0:45–1:45 went well):** website loader for `config/sites.json` fetch/follow_links sites, or UI polish. | — |
| 2:45–3:30 | **Hardening.** Test with Wi-Fi off (fixtures path), empty input, very long question, mixed-language question. Fix crashes. | No crashes |
| 3:30–4:00 | **Freeze code.** Commit. Record a 2-minute screen video of the full demo as backup. | Video saved |
| 4:00–5:00 | **Pitch.** Slides: problem → demo → how it works (diagram from spec §3) → reliability (sources, robots.txt respect, spend cap) → roadmap (spec §13). Rehearse twice. | Rehearsed |

**Rule:** if the chat isn't answering the demo questions correctly by 2:45, skip extras and keep fixing answers.

---

## Optional: website loader (only if time allows)
`server/src/lib/websiteLoader.js` + script:
- Read `config/sites.json`. `fetch` → cheerio main text. `follow_links` → collect links on the hub page matching `keep` patterns (same host only, skip `.nsf` and external domains), fetch each (max 15 per site, 1 request/second).
- Before fetching any site, check its robots.txt; skip and log if disallowed.
- `manual` → read the file from `manual/`.
- Send the raw text with `prompts/extract-services.md` to FAST_MODEL → append to `services.json`.
