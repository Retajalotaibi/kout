// Turn hand-copied website text (manual/*.md) into structured services with FAST_MODEL.
// Each page is extracted once: results are cached by a hash of (prompt + page), so re-running
// only pays for new or edited pages. Extracted services are saved in the store ("extracted_services").
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';
import { callJSON, FAST_MODEL } from './claude.js';
import { loadPrompt } from './prompts.js';
import { load, save } from './store.js';

const MANUAL_DIR = path.join(ROOT, 'manual');
const HEADER = /^===\s*(\S+)\s*\|\s*copied\s+(\d{4}-\d{2}-\d{2})\s*(?:\|\s*([^=]+?)\s*)?===\s*$/gm;
const MIN_PAGE_CHARS = 20;

const TOPICS = new Set(['civil_id', 'residency', 'traffic', 'work', 'health', 'education', 'other']);
const LIST_FIELDS = ['channels', 'conditions', 'documents', 'exemptions', 'steps', 'unclear'];

/** Split one manual file into pages: [{ url, copied, entity, text }]. */
export function parsePages(fileText, defaultEntity) {
  const text = fileText.replace(/<!--[\s\S]*?-->/g, ''); // instructions live in comments
  const fileEntity = text.match(/^Entity:\s*(.+)$/m)?.[1]?.trim() || defaultEntity;
  const headers = [...text.matchAll(HEADER)];
  return headers
    .map((h, i) => ({
      url: h[1],
      copied: h[2],
      entity: (h[3] || fileEntity || '').trim(),
      text: text.slice(h.index + h[0].length, headers[i + 1]?.index ?? text.length).trim(),
    }))
    .filter((p) => p.text.length >= MIN_PAGE_CHARS);
}

function manualFiles() {
  if (!fs.existsSync(MANUAL_DIR)) return [];
  return fs
    .readdirSync(MANUAL_DIR)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort()
    .map((f) => path.join(MANUAL_DIR, f));
}

function asList(v) {
  if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim()).map(String);
  return v ? [String(v)] : [];
}

/** Fill gaps from the page and coerce types; never invents content. */
function normalize(s, page) {
  const out = { ...s };
  for (const f of LIST_FIELDS) out[f] = asList(s[f]);
  out.entity = s.entity || page.entity;
  out.topic = TOPICS.has(s.topic) ? s.topic : 'other';
  out.source_url = s.source_url || page.url;
  out.copied_on = s.copied_on || page.copied;
  out.fees = s.fees ?? null;
  out.apply_url = s.apply_url ?? null;
  return out;
}

/**
 * Extract services from every page in manual/*.md.
 * Returns { pages, extracted, cached, failed, services }.
 */
export async function extractServices({ force = false } = {}) {
  const system = loadPrompt('extract-services');
  const cache = await load('extract_cache', {});
  const stats = { pages: 0, extracted: 0, cached: 0, failed: 0 };
  const services = [];
  const seenKeys = new Set();

  for (const file of manualFiles()) {
    const stem = path.basename(file, '.md');
    for (const page of parsePages(fs.readFileSync(file, 'utf-8'), stem.toUpperCase())) {
      stats.pages++;
      const input = `Entity: ${page.entity}\n\n=== ${page.url} | copied ${page.copied} ===\n${page.text}`;
      const key = crypto.createHash('sha1').update(system).update(input).digest('hex');
      seenKeys.add(key);

      let result = !force ? cache[key] : undefined;
      if (result) {
        stats.cached++;
      } else {
        const out = await callJSON(FAST_MODEL(), system, input, { maxTokens: 8000, fallback: null });
        if (!Array.isArray(out)) {
          stats.failed++;
          console.error(`[services] extraction failed for ${page.url} (${stem}.md); will retry next run`);
          continue;
        }
        result = out.filter((s) => s && typeof s === 'object').map((s) => normalize(s, page));
        cache[key] = result;
        stats.extracted++;
        console.log(`[services] ${stem}.md ${page.url} -> ${result.length} service(s)`);
      }
      services.push(...result);
    }
  }

  // Drop cache entries for pages that no longer exist, then de-duplicate by service_ar + entity.
  for (const k of Object.keys(cache)) if (!seenKeys.has(k)) delete cache[k];
  await save('extract_cache', cache);

  const byKey = new Map();
  for (const s of services) byKey.set(`${(s.service_ar ?? s.service_en ?? '').trim()}|${(s.entity ?? '').trim()}`, s);
  const unique = [...byKey.values()];
  await save('extracted_services', unique);

  console.log(
    `[services] pages=${stats.pages} extracted=${stats.extracted} cached=${stats.cached} failed=${stats.failed} services=${unique.length}`,
  );
  return { ...stats, services: unique };
}
