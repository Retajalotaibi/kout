import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, DATA, readJSON } from './paths.js';
import { loadCleanPosts } from './classify.js';
import { load, save } from './store.js';

const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : v ? [v] : []);
const dateOnly = (d) => (d ? String(d).slice(0, 10) : '');

/**
 * All services: extracted from manual/*.md (store) + any drop-in JSON (data/services.json, data/services/*.json),
 * de-duplicated by service_ar + entity (drop-in JSON wins). Falls back to the PACI sample when there are none.
 */
export async function loadServices() {
  const extracted = await load('extracted_services', []);
  const sources = [path.join(DATA, 'services.json')];
  const dir = path.join(DATA, 'services');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.json')) sources.push(path.join(dir, f));
  }
  let all = [...extracted, ...sources.flatMap((f) => [readJSON(f, [])].flat(2))].filter((s) => s && typeof s === 'object');
  if (!all.length) {
    console.warn('[knowledge] no services yet (manual/*.md or data/services.json); using services.sample.json');
    all = [readJSON(path.join(DATA, 'services.sample.json'), [])].flat(2);
  }
  const seen = new Map();
  for (const s of all) {
    const key = `${(s.service_ar ?? s.service_en ?? '').trim()}|${(s.entity ?? '').trim()}`;
    seen.set(key, s); // later files win
  }
  return [...seen.values()];
}

function entityByHandle() {
  const map = {};
  for (const a of readJSON(path.join(CONFIG, 'accounts.json'), [])) {
    if (a.handle && a.handle !== 'TODO') map[a.handle.replace(/^@/, '').toLowerCase()] = a.entity;
  }
  return map;
}

function serviceItem(s, n) {
  const id = `svc:${n}`;
  const title = [s.service_ar, s.service_en].filter(Boolean).join(' / ');
  const date = dateOnly(s.copied_on);
  const lines = [
    `[${id}] WEBSITE | ${s.entity ?? ''} | ${s.topic ?? 'other'} | copied ${date || 'unknown'}`,
    `Service: ${title}${s.audience ? ` (audience: ${s.audience})` : ''}`,
  ];
  const fields = [
    ['Channels', list(s.channels)], ['Conditions', list(s.conditions)], ['Documents', list(s.documents)],
    ['Fees', list(s.fees)], ['Exemptions', list(s.exemptions)], ['Steps', list(s.steps)],
    ['Services offered', list(s.offered)],
  ];
  for (const [label, vals] of fields) if (vals.length) lines.push(`${label}: ${vals.join(' ; ')}`);
  if (list(s.unclear).length) lines.push(`Unclear: ${list(s.unclear).join(' ; ')}`);
  if (s.apply_url) lines.push(`Apply: ${s.apply_url}`);
  lines.push(`URL: ${s.source_url ?? ''}`);

  const searchText = [s.service_ar, s.service_en, s.entity, s.topic, s.audience, ...fields.flatMap(([, v]) => v)]
    .filter(Boolean).join(' ');
  return {
    id, sourceType: 'website', entity: s.entity ?? '', topic: s.topic ?? 'other', title, date,
    url: s.source_url ?? '', searchText, promptText: lines.join('\n'), unclear: list(s.unclear),
  };
}

function postItem(p, entities) {
  const id = `x:${p.id}`;
  const entity = entities[String(p.account).toLowerCase()] ?? p.account;
  const date = dateOnly(p.date);
  const lines = [
    `[${id}] X POST | ${entity} | ${p.topic ?? 'other'} | ${date} | category: ${p.category}`,
    `Text: ${p.text}`,
  ];
  if (list(p.links).length) lines.push(`Links: ${list(p.links).join(' ')}`);
  lines.push(`URL: ${p.url}`);
  return {
    id, sourceType: 'x_post', entity, topic: p.topic ?? 'other', title: p.summary_en || p.text.slice(0, 80), date,
    url: p.url, searchText: [p.text, p.summary_en, entity, p.topic, p.category].filter(Boolean).join(' '),
    promptText: lines.join('\n'), unclear: [],
  };
}

export async function buildKnowledge() {
  const services = await loadServices();
  const posts = await loadCleanPosts();
  const entities = entityByHandle();
  const items = [...services.map((s, i) => serviceItem(s, i + 1)), ...posts.map((p) => postItem(p, entities))];
  await save('knowledge', items);
  console.log(`[knowledge] services=${services.length} posts=${posts.length} -> ${items.length} items`);
  return items;
}

export async function loadKnowledge() {
  const items = await load('knowledge', null);
  return Array.isArray(items) ? items : buildKnowledge();
}
