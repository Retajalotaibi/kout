import express from 'express';
import { CHAT_MODEL, FAST_MODEL, checkModel, llmSpend } from './lib/claude.js';
import { budgetSnapshot, enabledAccounts } from './lib/xSource.js';
import { loadPosts } from './lib/posts.js';
import { loadLabels } from './lib/classify.js';
import { loadKnowledge } from './lib/knowledge.js';
import { storeStatus } from './lib/store.js';
import { parseTweetsQuery, ENTITY_AR } from './lib/intent.js';
import { summarizePosts } from './lib/summarize.js';
import { enabledAccounts as allAccountsFor } from './lib/xSource.js';
import { runPoll } from './lib/pipeline.js';
import { answerQuestion } from './lib/chat.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

// Connectivity check. Makes no billed calls: Anthropic models lookup is free; X is config-only.
app.get('/api/health', async (_req, res) => {
  const [chat, fast, store] = await Promise.all([checkModel(CHAT_MODEL()), checkModel(FAST_MODEL()), storeStatus()]);
  const accounts = enabledAccounts();
  res.json({
    anthropic: { keySet: Boolean(process.env.ANTHROPIC_API_KEY), chat, fast },
    x: { tokenSet: Boolean(process.env.X_BEARER_TOKEN), enabledAccounts: accounts.map((a) => a.handle) },
    store,
  });
});

// Most recent ingested X posts (read from disk; no API call).
app.get('/api/posts', async (_req, res) => {
  const [posts, labels] = await Promise.all([loadPosts(), loadLabels()]);
  res.json(
    [...posts]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 20)
      .map((p) => ({ ...p, label: labels[p.id] ?? null })),
  );
});

// "Check for new announcements": poll X, label new posts, rebuild knowledge.
let polling = false;
app.post('/api/poll', async (_req, res) => {
  if (polling) return res.status(409).json({ error: 'A check is already running.' });
  polling = true;
  try {
    res.json(await runPoll());
  } catch (err) {
    console.error('[poll]', err);
    res.status(500).json({ error: 'Check failed. See the server log.' });
  } finally {
    polling = false;
  }
});

// Chat box (step 1): recent-tweet questions are answered from the database for free.
// Everything else gets a "coming soon" reply until /api/chat (search + Claude) is built.
app.post('/api/ask', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  if (!message) return res.status(400).json({ error: 'message is required' });

  const q = parseTweetsQuery(message);
  const ar = /[\u0600-\u06FF]/.test(message);
  if (!q) {
    try {
      const r = await answerQuestion(message, req.body?.history);
      return res.json({ kind: 'answer', ...r });
    } catch (err) {
      console.error('[ask]', err);
      return res.status(500).json({ error: ar ? 'حدث خطأ، حاول مرة أخرى.' : 'Something went wrong, please try again.' });
    }
  }


  const [posts, labels] = await Promise.all([loadPosts(), loadLabels()]);
  const handles = new Set(q.accounts.map((a) => a.handle.toLowerCase()));
  const matches = [...posts]
    .filter((p) => !handles.size || handles.has(String(p.account).toLowerCase()))
    .filter((p) => !q.keptOnly || (labels[p.id] && labels[p.id].category !== 'not_relevant'))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const shown = matches.slice(0, q.count).map((p) => ({ ...p, label: labels[p.id] ?? null }));

  const entities = [...new Set(q.accounts.map((a) => a.entity))];
  const who = entities.length ? entities.map((e) => (ar ? ENTITY_AR[e] ?? e : e)).join(ar ? '، ' : ', ') : null;
  let text;
  if (!shown.length) {
    text = ar
      ? `لا توجد تغريدات محفوظة${who ? ` من ${who}` : ''}${q.keptOnly ? ' مصنفة كمفيدة' : ''} حتى الآن.`
      : `No ${q.keptOnly ? 'useful ' : ''}tweets saved${who ? ` from ${who}` : ''} yet.`;
  } else {
    text = ar
      ? `آخر ${shown.length} ${shown.length === 1 ? 'تغريدة' : 'تغريدات'}${q.keptOnly ? ' مفيدة' : ''}${who ? ` من ${who}` : ''}:`
      : `The latest ${shown.length === 1 ? '' : `${shown.length} `}${q.keptOnly ? 'useful ' : ''}${shown.length === 1 ? 'tweet' : 'tweets'}${who ? ` from ${who}` : ''}:`;
    if (shown.length < q.count && matches.length === shown.length) {
      text += ar ? ` (هذا كل ما هو محفوظ)` : ` (that's all we have saved)`;
    }
  }
  // AI summary of the shown tweets (FAST_MODEL, cached). Failure just means no summary.
  const entityByHandle = Object.fromEntries(allAccountsFor().map((a) => [a.handle.toLowerCase(), a.entity]));
  const { summary, cached } = await summarizePosts(message, shown, {
    arabic: ar,
    entityOf: (p) => entityByHandle[String(p.account).toLowerCase()] ?? p.account,
  });
  res.json({ kind: 'tweets', text, summary, summaryCached: cached, posts: shown });
});

app.get('/api/stats', async (_req, res) => {
  const knowledge = await loadKnowledge();
  res.json({
    services: knowledge.filter((k) => k.sourceType === 'website').length,
    posts: knowledge.filter((k) => k.sourceType === 'x_post').length,
    llm: await llmSpend(),
    x: await budgetSnapshot(),
  });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  chat=${CHAT_MODEL()} fast=${FAST_MODEL()}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('[server] ANTHROPIC_API_KEY is not set.');
});
