# MVP Spec — Kuwait Gov Info Chatbot

## 1. Problem and pitch
Information about Kuwaiti government services is spread across many ministry websites and X accounts, in two languages, and rules change often. Citizens and expats struggle to find the current, official answer.

**Our app:** ask a question in Arabic or English, get a short answer built only from official sources, with every source shown (entity, date, link). Website pages provide the standing rules; official X posts provide the latest changes. When they conflict, the newer one wins and the bot says what changed.

## 2. Scope
**In:** 2–3 demo topics (e.g. civil ID, residency, traffic), 5–7 official X accounts, 10–30 website service pages, chat UI, source cards, X "check for new" button with spend display.

**Out (roadmap only):** OCR of image posts, official gazette PDFs, vector DB, user accounts, notifications, deployment at scale.

## 3. Architecture
```
config/accounts.json ─► ingest:x (xSource.js) ─► data/posts.json
                                                    │
                                          classify (FAST_MODEL)
                                                    ▼
data/services.json (friend's AI output) ──► build:knowledge ─► data/knowledge.json
                                                                   │
React client ─► POST /api/chat ─► query expansion ─► BM25 search ─► CHAT_MODEL ─► answer + sources
            └─► POST /api/poll ─► ingest + classify + rebuild (live update)
```

## 4. Repository layout
```
CLAUDE.md  MVP-SPEC.md  implementation-plan.md  .env.example  package.json
config/   accounts.json  sites.json
prompts/  extract-services.md  classify-posts.md  query-expand.md  chat-system.md
data/     services.json  services.sample.json  posts.json  posts_clean.json  knowledge.json  fixtures.json  state.json
manual/   *.md  (hand-copied pages for robots-blocked sites)
reference/x_source.py  (Python original to port)
server/src/
  index.js            Express app, routes
  lib/xSource.js      X API poll with budget guard (port of reference)
  lib/classify.js     label posts with FAST_MODEL
  lib/knowledge.js    build/load KnowledgeItems
  lib/search.js       Arabic-aware BM25
  lib/claude.js       Anthropic client + JSON helpers
  lib/prompts.js      load prompts/*.md
  scripts/            ingest-x.js  classify.js  build-knowledge.js
client/src/
  App.jsx  components/ChatWindow.jsx  Message.jsx  SourceCard.jsx  AdminBar.jsx  SuggestedQuestions.jsx
```

## 5. Data model

### 5.1 Service (from `data/services.json`, produced by the friend's AI using `prompts/extract-services.md`)
```
service_ar, service_en, entity, topic, audience, channels[], conditions[], documents[],
fees, exemptions[], steps[], apply_url, source_url, copied_on, unclear[]
```
`services.json` is a JSON array. If the friend sends several arrays, merge and de-duplicate by `service_ar + entity`.

### 5.2 Post (from X, written by `xSource.js`)
```
{ id, account, date, text, lang, images[], links[], url }
```
After classification (`posts_clean.json`) each kept post also has:
```
{ category: "rule" | "procedure" | "clarification", topic, summary_en }
```
Posts labelled `not_relevant` are dropped.

### 5.3 KnowledgeItem (unified, in `data/knowledge.json`)
```
{
  id:          "svc:<n>" | "x:<post id>",
  sourceType:  "website" | "x_post",
  entity:      "PACI" | "MOI" | ...,
  topic:       "civil_id" | "residency" | "traffic" | "work" | "health" | "education" | "other",
  title:       service_ar (+ " / " + service_en) | summary_en,
  date:        ISO date (copied_on for website, post date for X),
  url:         source_url | post url,
  searchText:  all text fields joined (Arabic + English) — used by BM25,
  promptText:  compact readable block sent to the model (see 7.3),
  unclear:     [] (website only)
}
```

## 6. Search (server/src/lib/search.js)
- BM25 over `searchText`, k1 = 1.5, b = 0.75. Plain JS, no library.
- **Arabic normalization** (apply to documents and queries): remove diacritics/tatweel; أ إ آ → ا; ة → ه; ى → ي; lowercase Latin; strip punctuation; drop a leading "ال" from tokens longer than 3 letters; remove a short stopword list (Arabic + English).
- **Cross-language fix:** before searching, call FAST_MODEL with `prompts/query-expand.md` to get keywords in both Arabic and English, plus the likely topic. Search with the original question + keywords.
- Return top 12 items. If the expanded topic is known, add a small score boost (×1.2) for matching topic.
- Tie-break and final ordering: score first, then newer date.

## 7. API (Express, port 3001)

### 7.1 `POST /api/chat`
Request: `{ "message": string, "history": [{ "role": "user"|"assistant", "content": string }] }` (send at most the last 6 turns)

Response:
```
{
  "answer": string,
  "status": "answered" | "not_found",
  "sources": [{ "id", "sourceType", "entity", "date", "url", "title" }],
  "change_note": string | null
}
```
Flow: query-expand → search → build prompt from `prompts/chat-system.md` + the retrieved items' `promptText` → CHAT_MODEL → parse JSON `{ answer, source_ids[], status, change_note }` → map `source_ids` to sources (drop unknown ids).

### 7.2 `POST /api/poll`
Runs one X poll (`pollOnce`), classifies new posts, rebuilds knowledge in memory and on disk.
Response: `{ "source": "x_api"|"fixtures", "fetched": n, "kept": n, "spentUsd": n, "remainingUsd": n, "newItems": [{ id, entity, date, title, url }] }`

### 7.3 `GET /api/stats`
`{ "services": n, "posts": n, "spentUsd": n, "remainingUsd": n, "lastPoll": ISO|null }`

### 7.4 promptText format
```
[svc:12] WEBSITE | PACI | civil_id | copied 2026-11-14
Service: تجديد بطاقة كويتي / Civil ID renewal – Kuwaiti citizens
Channels: ... | Conditions: ... | Documents: ... | Fees: ... | Exemptions: ... | Steps: ...
Unclear: ...
URL: ...

[x:1890...] X POST | MOI | traffic | 2026-11-10 | category: rule
Text: ...
URL: ...
```

## 8. X ingestion (server/src/lib/xSource.js)
Port `reference/x_source.py`:
- Accounts from `config/accounts.json` (only entries with `"enabled": true`; user IDs cached in `data/state.json`).
- `GET /2/users/by?usernames=` once; `GET /2/users/:id/tweets` with `since_id`, `exclude=retweets,replies`, `tweet.fields=created_at,lang,entities,attachments`, `expansions=attachments.media_keys`, `media.fields=url,preview_image_url,type`. No `author_id` expansion.
- Budget guard: `X_MAX_BUDGET_USD` (default 3), post read $0.005, user read $0.010 (configurable via env). Never request when the estimate would exceed the cap; `max_results` minimum is 5.
- On 429: log reset time and skip. One failing account never stops the poll.
- Fallback to `data/fixtures.json` when no token, no accounts or no budget.
- Save state after every poll.

## 9. Classification (server/src/lib/classify.js)
Batch up to 20 posts per FAST_MODEL call with `prompts/classify-posts.md`. Output `[{ id, category, topic, summary_en }]`. Drop `not_relevant`. Posts about arrests, crimes, condolences, ceremonies or named private individuals are always `not_relevant`.

## 10. UI (client)
- Single page: header (app name + one-line description), disclaimer banner, chat window, input box.
- **Disclaimer (always visible):** "Answers come from official sources only. Always confirm with the relevant government entity." Show Arabic version too.
- **SuggestedQuestions:** 4 clickable chips from the demo list (section 12).
- **Message:** `dir="auto"`, markdown-light rendering (bold, lists), loading indicator.
- **SourceCard** under each answer: badge ("Website" / "X post"), entity, date, title, link (new tab).
- **change_note**, when present, shown as a highlighted notice above sources.
- **not_found** answers styled differently (neutral grey) and suggest the relevant entity.
- **AdminBar** (small, top-right): "Check for new announcements" button → `/api/poll`; shows result count, source (live/fixtures), and "API spend: $x of $y".
- Fonts: IBM Plex Sans Arabic or Noto Sans Arabic (Google Fonts) with system fallbacks. Clean, government-appropriate look; not flashy.

## 11. Environment (.env)
```
ANTHROPIC_API_KEY=
CHAT_MODEL=claude-sonnet-5-5
FAST_MODEL=claude-haiku-5-5
X_BEARER_TOKEN=
X_MAX_BUDGET_USD=3
X_POST_READ_USD=0.005
X_USER_READ_USD=0.010
PORT=3001
```

## 12. Demo questions (acceptance tests)
Fill these in once the real data is loaded; each must give a correct, cited answer.
1. A clear service question in Arabic (e.g. "كم رسوم تجديد البطاقة المدنية؟") → fee + PACI source.
2. The same kind of question in English → English answer, same sources.
3. A documents/requirements question → list copied from the official page.
4. A question where an X post updates a website rule → newer info + `change_note`.
5. A question about a rumour the ministry denied (if such a post exists in the data).
6. A question the data can't answer → `status: "not_found"`, suggests the right entity, no invented answer.

## 13. Pitch roadmap slide (not built)
OCR for image announcements · official gazette as a third source · vector search · subscriptions to topic updates · official data feeds instead of copied pages.
