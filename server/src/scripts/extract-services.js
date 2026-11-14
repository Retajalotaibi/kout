// manual/*.md -> structured services (FAST_MODEL, cached per page) -> knowledge rebuild.
// Usage: npm run extract:services            (only new/edited pages are sent to Claude)
//        npm run extract:services -- --force (re-extract every page)
import { extractServices } from '../lib/services.js';
import { buildKnowledge } from '../lib/knowledge.js';
import { closeStore } from '../lib/store.js';

const { pages, extracted, cached, failed, services } = await extractServices({ force: process.argv.includes('--force') });
if (!pages) console.log('No pages found. Paste pages into manual/*.md under a "=== <URL> | copied <YYYY-MM-DD> ===" header.');
for (const s of services) {
  console.log(`  [${s.entity}] ${s.service_ar ?? ''}${s.service_en ? ` / ${s.service_en}` : ''} | fees: ${s.fees ?? '-'}`);
}
await buildKnowledge();
console.log(`Done: ${pages} page(s), ${extracted} sent to Claude, ${cached} from cache, ${failed} failed.`);
await closeStore();
