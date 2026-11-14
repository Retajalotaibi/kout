import crypto from 'node:crypto';
import { callJSON, FAST_MODEL } from './claude.js';
import { loadPrompt } from './prompts.js';
import { load, save } from './store.js';

const CACHE = 'summary_cache';

/** Summarise posts with FAST_MODEL. Cached by language + post ids, so repeat requests cost $0. */
export async function summarizePosts(question, posts, { arabic = false, entityOf = (p) => p.account } = {}) {
  if (!posts.length) return { summary: null, cached: false };
  const lang = arabic ? 'ar' : 'en';
  const system = loadPrompt('summarize-tweets').replace('{{LANGUAGE}}', arabic ? 'Arabic' : 'English');
  // Key includes a prompt fingerprint, so editing the prompt automatically ignores old summaries.
  const promptHash = crypto.createHash('sha1').update(system).digest('hex').slice(0, 8);
  const key = `${lang}:${promptHash}:${posts.map((p) => p.id).sort().join(',')}`;

  const cache = await load(CACHE, {});
  if (cache[key]) return { summary: cache[key].summary, cached: true };

  const input = posts.map((p) => ({ account: p.account, entity: entityOf(p), date: String(p.date).slice(0, 10), text: p.text }));
  const out = await callJSON(FAST_MODEL(), system, `Question: ${question}\n\nPosts:\n${JSON.stringify(input, null, 1)}`, {
    maxTokens: 800,
    fallback: null,
  });
  const summary = typeof out?.summary === 'string' && out.summary.trim() ? out.summary.trim() : null;
  if (summary) {
    cache[key] = { summary, at: new Date().toISOString() };
    await save(CACHE, cache);
  }
  return { summary, cached: false };
}
