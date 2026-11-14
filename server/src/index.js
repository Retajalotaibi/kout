import express from 'express';
import { readJSON } from './lib/paths.js';
import { CHAT_MODEL, FAST_MODEL, checkModel, llmSpend } from './lib/claude.js';
import { budgetSnapshot, enabledAccounts } from './lib/xSource.js';
import { POSTS_FILE } from './lib/posts.js';
import { LABELS_FILE } from './lib/classify.js';
import { KNOWLEDGE_FILE } from './lib/knowledge.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

// Connectivity check. Makes no billed calls: Anthropic models lookup is free; X is config-only.
app.get('/api/health', async (_req, res) => {
  const [chat, fast] = await Promise.all([checkModel(CHAT_MODEL()), checkModel(FAST_MODEL())]);
  const accounts = enabledAccounts();
  res.json({
    anthropic: { keySet: Boolean(process.env.ANTHROPIC_API_KEY), chat, fast },
    x: { tokenSet: Boolean(process.env.X_BEARER_TOKEN), enabledAccounts: accounts.map((a) => a.handle) },
  });
});

// Most recent ingested X posts (read from disk; no API call).
app.get('/api/posts', (_req, res) => {
  const posts = readJSON(POSTS_FILE, []);
  const labels = readJSON(LABELS_FILE, {});
  res.json(
    [...posts]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 20)
      .map((p) => ({ ...p, label: labels[p.id] ?? null })),
  );
});

app.get('/api/stats', (_req, res) => {
  const knowledge = readJSON(KNOWLEDGE_FILE, []);
  res.json({
    services: knowledge.filter((k) => k.sourceType === 'website').length,
    posts: knowledge.filter((k) => k.sourceType === 'x_post').length,
    llm: llmSpend(),
    x: budgetSnapshot(),
  });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  chat=${CHAT_MODEL()} fast=${FAST_MODEL()}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('[server] ANTHROPIC_API_KEY is not set.');
});
