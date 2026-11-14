import path from 'node:path';
import express from 'express';
import { CONFIG, readJSON } from './lib/paths.js';
import { CHAT_MODEL, FAST_MODEL, checkModel, llmSpend } from './lib/claude.js';
import { budgetSnapshot } from './lib/xSource.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

// Connectivity check. Makes no billed calls: Anthropic models lookup is free; X is config-only.
app.get('/api/health', async (_req, res) => {
  const [chat, fast] = await Promise.all([checkModel(CHAT_MODEL()), checkModel(FAST_MODEL())]);
  const accounts = readJSON(path.join(CONFIG, 'accounts.json'), []).filter(
    (a) => a.enabled && a.handle && a.handle !== 'TODO',
  );
  res.json({
    anthropic: { keySet: Boolean(process.env.ANTHROPIC_API_KEY), chat, fast },
    x: { tokenSet: Boolean(process.env.X_BEARER_TOKEN), enabledAccounts: accounts.map((a) => a.handle) },
  });
});

app.get('/api/stats', (_req, res) => {
  res.json({ llm: llmSpend(), x: budgetSnapshot() });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  chat=${CHAT_MODEL()} fast=${FAST_MODEL()}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('[server] ANTHROPIC_API_KEY is not set.');
});
