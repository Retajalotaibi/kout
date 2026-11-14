import { pollOnce, budgetSnapshot, enabledAccounts } from './xSource.js';
import { appendPosts, loadPosts } from './posts.js';
import { classifyNew, loadLabels } from './classify.js';
import { buildKnowledge } from './knowledge.js';
import { llmSpend } from './claude.js';

/** One "check for new announcements": poll X -> append -> classify new -> rebuild knowledge. */
export async function runPoll() {
  const { items, source } = await pollOnce();
  const fresh = await appendPosts(items);
  const kept = await classifyNew();
  const knowledge = await buildKnowledge();
  const labels = await loadLabels();
  // Every newly fetched post with its label (kept or dropped) so the UI can show what happened.
  const newPosts = fresh.map((p) => ({ ...p, label: labels[p.id] ?? null }));

  const keptIds = new Set(kept.map((p) => `x:${p.id}`));
  const newItems = knowledge
    .filter((k) => keptIds.has(k.id))
    .map(({ id, entity, date, title, url }) => ({ id, entity, date, title, url }));


  // Latest stored post per checked account (or overall, for fixtures), so "no new posts" still shows something.
  const stored = [...(await loadPosts())].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const newestStored = stored[0]?.date ?? '';
  const checked = source === 'x_api' ? enabledAccounts().map((a) => a.handle.toLowerCase()) : [];
  const latest = checked.length
    ? checked.map((h) => stored.find((p) => String(p.account).toLowerCase() === h)).filter(Boolean)
    : stored.slice(0, 1);
  const latestPosts = latest.map((p) => ({ ...p, label: labels[p.id] ?? null }));

  const x = await budgetSnapshot();
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
    llm: await llmSpend(),
    newItems,
    newPosts,
    latestPosts,
  };
}
