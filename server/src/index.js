import express from 'express';
import { CHAT_MODEL, FAST_MODEL, checkModel, llmSpend } from './lib/claude.js';
import { budgetSnapshot, enabledAccounts } from './lib/xSource.js';
import { loadPosts } from './lib/posts.js';
import { loadLabels } from './lib/classify.js';
import { loadKnowledge } from './lib/knowledge.js';
import { storeStatus } from './lib/store.js';
import { runPoll } from './lib/pipeline.js';

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
