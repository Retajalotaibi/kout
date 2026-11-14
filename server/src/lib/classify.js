import path from 'node:path';
import { DATA, readJSON, writeJSON } from './paths.js';
import { callJSON, FAST_MODEL } from './claude.js';
import { loadPrompt } from './prompts.js';
import { POSTS_FILE } from './posts.js';
export const LABELS_FILE = path.join(DATA, 'labels.json'); // id -> label, for every classified post (incl. not_relevant)
export const CLEAN_FILE = path.join(DATA, 'posts_clean.json');

const CATEGORIES = new Set(['rule', 'procedure', 'clarification', 'not_relevant']);
const TOPICS = new Set(['civil_id', 'residency', 'traffic', 'work', 'health', 'education', 'other']);
const BATCH = 20;

/** Label posts with FAST_MODEL. Returns { [id]: { category, topic, summary_en } } for posts the model labelled. */
export async function classifyPosts(posts) {
  const system = loadPrompt('classify-posts');
  const labels = {};
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    const input = batch.map(({ id, account, date, text, links }) => ({ id, account, date, text, links }));
    const out = await callJSON(FAST_MODEL(), system, JSON.stringify(input, null, 1), { maxTokens: 4000, fallback: [] });
    if (!Array.isArray(out)) {
      console.error('[classify] batch returned non-array; will retry next run');
      continue;
    }
    for (const r of out) {
      if (!r || !batch.some((p) => p.id === String(r.id))) continue;
      labels[String(r.id)] = {
        category: CATEGORIES.has(r.category) ? r.category : 'not_relevant',
        topic: TOPICS.has(r.topic) ? r.topic : 'other',
        summary_en: typeof r.summary_en === 'string' ? r.summary_en : '',
      };
    }
  }
  return labels;
}

/** Classify every post in posts.json that has no label yet; rewrite posts_clean.json. Returns newly kept posts. */
export async function classifyNew() {
  const posts = readJSON(POSTS_FILE, []);
  const labels = readJSON(LABELS_FILE, {});
  const todo = posts.filter((p) => !labels[p.id]);
  const fresh = todo.length ? await classifyPosts(todo) : {};
  Object.assign(labels, fresh);
  writeJSON(LABELS_FILE, labels);

  const clean = posts
    .filter((p) => labels[p.id] && labels[p.id].category !== 'not_relevant')
    .map((p) => ({ ...p, ...labels[p.id] }));
  writeJSON(CLEAN_FILE, clean);

  const newlyKept = clean.filter((p) => fresh[p.id]);
  console.log(`[classify] labelled=${Object.keys(fresh).length}/${todo.length} kept_new=${newlyKept.length} clean_total=${clean.length}`);
  return newlyKept;
}
