// Service conditions -> age / nationality rules (FAST_MODEL, only new or changed services).
// Usage: npm run build:eligibility            (cached services are skipped)
//        npm run build:eligibility -- --force (re-extract everything)
import { buildEligibility, eligibilityList } from '../lib/eligibility.js';
import { closeStore } from '../lib/store.js';

const r = await buildEligibility({ force: process.argv.includes('--force') });
const rows = await eligibilityList();
for (const s of rows) {
  const age = s.min_age !== null || s.max_age !== null ? `age ${s.min_age ?? '-'}–${s.max_age ?? '-'}` : '';
  console.log(`  [${s.entity}] ${s.title_ar ?? s.title_en} | ${[age, s.nationality].filter(Boolean).join(' | ')}`);
}
console.log(`Done: ${r.services} services with conditions: ${r.extracted} extracted, ${r.cached} cached, ${r.failed} failed. ${rows.length} have age/nationality rules.`);
await closeStore();
