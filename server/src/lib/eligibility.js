// Eligibility rules (age + nationality) extracted once from service conditions with FAST_MODEL.
// Every rule must quote the official text exactly; rules whose quote isn't found in the source are dropped.
// Checking a user's eligibility happens in the browser (their civil ID never reaches the server).
import crypto from 'node:crypto';
import { callJSON, FAST_MODEL } from './claude.js';
import { loadPrompt } from './prompts.js';
import { loadServices } from './knowledge.js';
import { load, save } from './store.js';

const STORE = 'eligibility_rules';
const BATCH = 8;
const NATIONALITIES = new Set(['kuwaiti', 'non_kuwaiti', 'kuwaiti_or_kuwaiti_mother']);

const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()).map(String) : v ? [String(v)] : []);
const keyOf = (s) => `${(s.service_ar ?? s.service_en ?? '').trim()}|${(s.entity ?? '').trim()}`;
const hashOf = (s, prompt) =>
  crypto.createHash('sha1').update(JSON.stringify([prompt, s.service_ar, s.audience, s.conditions])).digest('hex').slice(0, 10);

// Loose comparison: ignore whitespace, diacritics, tatweel, brackets and punctuation; Arabic digits → Latin.
const loose = (t) =>
  String(t ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

function verify(raw, s) {
  const source = loose([s.audience, ...list(s.conditions)].join(' '));
  const inSource = (q) => typeof q === 'string' && q.trim() && source.includes(loose(q));
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

  let min = num(raw?.min_age);
  let max = num(raw?.max_age);
  let ageQuote = raw?.age_quote ?? null;
  const digitsOk = (n) => n === null || loose(ageQuote).includes(String(n));
  if ((min !== null || max !== null) && (!inSource(ageQuote) || !digitsOk(min) || !digitsOk(max))) {
    console.warn(`[eligibility] dropped age rule for "${keyOf(s)}" (quote not found: ${ageQuote})`);
    min = max = ageQuote = null;
  }
  if (min === null && max === null) ageQuote = null;

  let nationality = NATIONALITIES.has(raw?.nationality) ? raw.nationality : null;
  let natQuote = raw?.nationality_quote ?? null;
  if (nationality && !inSource(natQuote)) {
    console.warn(`[eligibility] dropped nationality rule for "${keyOf(s)}" (quote not found: ${natQuote})`);
    nationality = natQuote = null;
  }
  if (!nationality) natQuote = null;

  const other = list(raw?.other_conditions).filter(inSource).slice(0, 5);
  return { min_age: min, max_age: max, age_quote: ageQuote, nationality, nationality_quote: natQuote, other_conditions: other };
}

/** Extract rules for services that are new or changed since the last run. Returns counts. */
export async function buildEligibility({ force = false } = {}) {
  const prompt = loadPrompt('extract-eligibility');
  const services = (await loadServices()).filter((s) => s.audience || list(s.conditions).length);
  const stored = force ? {} : await load(STORE, {});
  const todo = services.filter((s) => stored[keyOf(s)]?.hash !== hashOf(s, prompt));

  let failed = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const input = batch.map((s) => ({
      key: keyOf(s),
      service: [s.service_ar, s.service_en].filter(Boolean).join(' / '),
      audience: Array.isArray(s.audience) ? s.audience.join(' ; ') : s.audience ?? null,
      conditions: list(s.conditions),
    }));
    const out = await callJSON(FAST_MODEL(), prompt, JSON.stringify(input, null, 1), { maxTokens: 4000, fallback: null });
    const byKey = new Map((Array.isArray(out?.items) ? out.items : []).map((it) => [String(it?.key), it]));
    for (const s of batch) {
      const raw = byKey.get(keyOf(s));
      if (!raw) { failed++; console.warn(`[eligibility] no result for "${keyOf(s)}"`); continue; }
      stored[keyOf(s)] = { hash: hashOf(s, prompt), rules: verify(raw, s) };
    }
    await save(STORE, stored);
  }
  return { services: services.length, extracted: todo.length - failed, cached: services.length - todo.length, failed };
}

/** Services that have at least one age or nationality rule, ready for the browser. */
export async function eligibilityList() {
  const stored = await load(STORE, {});
  const out = [];
  for (const s of await loadServices()) {
    let r = stored[keyOf(s)]?.rules;
    if (!r || (r.min_age === null && r.max_age === null && !r.nationality)) continue;
    // Services titled "… كويتي" (but not "كويتي / غير كويتي") are for Kuwaitis even when the conditions don't say so.
    const title = String(s.service_ar ?? '');
    if (!r.nationality && /كويتي/.test(title) && !/غير\s*كويتي/.test(title)) {
      r = { ...r, nationality: 'kuwaiti', nationality_quote: title };
    }
    out.push({
      key: keyOf(s),
      title_ar: s.service_ar ?? null,
      title_en: s.service_en ?? null,
      entity: s.entity ?? '',
      topic: s.topic ?? 'other',
      url: s.source_url ?? '',
      copied_on: s.copied_on ?? null,
      ...r,
    });
  }
  return out;
}
