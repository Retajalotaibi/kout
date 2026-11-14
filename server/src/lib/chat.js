import crypto from 'node:crypto';
import { callJSON, CHAT_MODEL, FAST_MODEL } from './claude.js';
import { loadPrompt } from './prompts.js';
import { loadKnowledge } from './knowledge.js';
import { load, save } from './store.js';
import { Index, normalize } from './search.js';

const EXPAND_CACHE = 'expand_cache';
const ANSWER_CACHE = 'answer_cache';
const TOPICS = new Set(['civil_id', 'residency', 'traffic', 'work', 'health', 'education', 'other']);
const MAX_HISTORY = 6;

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const isArabic = (s) => /[؀-ۿ]/.test(s);

// ---------------------------------------------------------------- index (rebuilt when knowledge changes)
let indexed = { version: null, index: null, byId: new Map() };

async function getIndex() {
  const knowledge = await loadKnowledge();
  const version = sha(knowledge.map((k) => `${k.id}\u0000${k.promptText}`).join('\u0001'));
  if (indexed.version !== version) {
    indexed = { version, index: new Index(knowledge), byId: new Map(knowledge.map((k) => [k.id, k])) };
    console.log(`[chat] indexed ${knowledge.length} knowledge items (version ${version})`);
  }
  return indexed;
}

// ---------------------------------------------------------------- history
/** Last MAX_HISTORY turns, alternating, starting with a user turn, plain strings only. */
function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const turns = history
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
    .map((h) => ({ role: h.role, content: h.content.trim().slice(0, 2000) }))
    .slice(-MAX_HISTORY);
  const merged = [];
  for (const t of turns) {
    if (merged.length && merged.at(-1).role === t.role) merged.at(-1).content += `\n${t.content}`;
    else merged.push({ ...t });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();
  // The new question is appended as a user turn, so history must end on an assistant turn.
  if (merged.length && merged.at(-1).role === 'user') merged.pop();
  return merged;
}

const historyKey = (history) => (history.length ? sha(history.map((h) => `${h.role}:${normalize(h.content)}`).join('|')) : '-');

// ---------------------------------------------------------------- query expansion (FAST_MODEL, cached)
async function expandQuery(message, history) {
  const system = loadPrompt('query-expand');
  const key = `${sha(system)}:${historyKey(history)}:${normalize(message).replace(/\s+/g, ' ').trim()}`;
  const cache = await load(EXPAND_CACHE, {});
  if (cache[key]) return cache[key].value;

  const convo = history.map((h) => `${h.role}: ${h.content}`).join('\n');
  const user = `${convo ? `Recent conversation:\n${convo}\n\n` : ''}Question: ${message}`;
  const out = await callJSON(FAST_MODEL(), system, user, { maxTokens: 400, fallback: null });
  const words = (v) => (Array.isArray(v) ? v.filter((w) => typeof w === 'string' && w.trim()).slice(0, 10) : []);
  if (!out || typeof out !== 'object') return { keywords: [], topic: null }; // don't cache failures
  const value = {
    keywords: [...words(out.keywords_ar), ...words(out.keywords_en)],
    topic: TOPICS.has(out.topic) ? out.topic : null,
  };
  cache[key] = { value, at: new Date().toISOString() };
  await save(EXPAND_CACHE, cache);
  return value;
}

// ---------------------------------------------------------------- answer
function notFound(message, text) {
  return { answer: text ?? (isArabic(message)
    ? 'لم أجد إجابة لهذا السؤال في المصادر الرسمية المتوفرة لدي. يرجى التواصل مع الجهة الحكومية المختصة.'
    : "I couldn't find an answer to this in the official sources I have. Please contact the relevant government entity."),
  status: 'not_found', sources: [], change_note: null };
}

/**
 * Answer a question from the knowledge base.
 * Returns { answer, status, sources[], change_note, cached }.
 */
export async function answerQuestion(message, rawHistory = []) {
  const history = cleanHistory(rawHistory);
  const { version, index, byId } = await getIndex();
  const system0 = loadPrompt('chat-system');

  // Same question + same history + same knowledge + same prompt → saved answer ($0).
  const cacheKey = `${version}:${sha(system0)}:${historyKey(history)}:${normalize(message).replace(/\s+/g, ' ').trim()}`;
  const cache = await load(ANSWER_CACHE, {});
  if (cache[cacheKey]) return { ...cache[cacheKey].value, cached: true };

  const { keywords, topic } = await expandQuery(message, history);
  const hits = index.search(message, keywords, topic);
  console.log(`[chat] topic=${topic} keywords=${keywords.length} hits=${hits.map((h) => `${h.item.id}:${h.score.toFixed(1)}`).join(' ')}`);
  if (!hits.length) return { ...notFound(message), cached: false };

  const system = system0.replace('{{SOURCES}}', hits.map((h) => h.item.promptText).join('\n\n'));
  const out = await callJSON(CHAT_MODEL(), system, [...history, { role: 'user', content: message }], {
    maxTokens: 1500,
    fallback: null,
  });
  if (!out || typeof out.answer !== 'string' || !out.answer.trim()) {
    return {
      ...notFound(message, isArabic(message)
        ? 'تعذّر الحصول على إجابة الآن. يرجى المحاولة مرة أخرى.'
        : "I couldn't get an answer right now. Please try again."),
      status: 'error',
      cached: false,
    };
  }

  const ids = Array.isArray(out.source_ids) ? [...new Set(out.source_ids.map(String))] : [];
  const sources = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(({ id, sourceType, entity, date, url, title }) => ({ id, sourceType, entity, date, url, title }));
  const status = out.status === 'not_found' ? 'not_found' : 'answered';
  const value = {
    answer: out.answer.trim(),
    status,
    sources: status === 'not_found' ? [] : sources,
    change_note: typeof out.change_note === 'string' && out.change_note.trim() ? out.change_note.trim() : null,
  };
  cache[cacheKey] = { value, question: message, at: new Date().toISOString() };
  await save(ANSWER_CACHE, cache);
  return { ...value, cached: false };
}
