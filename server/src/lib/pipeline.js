import { readJSON } from './paths.js';
import { pollOnce, budgetSnapshot, enabledAccounts } from './xSource.js';
import { appendPosts, POSTS_FILE } from './posts.js';
import { classifyNew, LABELS_FILE } from './classify.js';
import { buildKnowledge } from './knowledge.js';
import { llmSpend } from './claude.js';

/** One "check for new announcements": poll X -> append -> classify new -> rebuild knowledge. */
export async function runPoll() {
  const { items, source } = await pollOnce();
  const fresh = appendPosts(items);
  const kept = await classifyNew();
  const knowledge = buildKnowledge();

  const keptIds = new Set(kept.map((p) => `x:${p.id}`));
  const newItems = knowledge
    .filter((k) => keptIds.has(k.id))
    .map(({ id, entity, date, title, url }) => ({ id, entity, date, title, url }));

  // Every newly fetched post with its label (kept or dropped) so the UI can show what happened.
  const labels = readJSON(LABELS_FILE, {});
  const newPosts = fresh.map((p) => ({ ...p, label: labels[p.id] ?? null }));

  const newestStored = readJSON(POSTS_FILE, []).reduce((max, p) => (String(p.date) > max ? String(p.date) : max), '');

  const x = budgetSnapshot();
  return {
    source,
    accounts: source === 'x_api' ? enabledAccounts().map((a) => a.handle) : [],
    newestStored: newestStored || null,
    fetched: items.length,
    added: fresh.length,
    kept: kept.length,
    spentUsd: x.spentUsd,
    remainingUsd: x.remainingUsd,
    capUsd: x.capUsd,
    llm: llmSpend(),
    newItems,
    newPosts,
  };
}
