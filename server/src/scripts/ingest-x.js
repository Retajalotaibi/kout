import { pollOnce } from '../lib/xSource.js';
import { appendPosts } from '../lib/posts.js';
import { closeStore } from '../lib/store.js';

const { items, source } = await pollOnce();
const fresh = await appendPosts(items);
console.log(`source=${source} fetched=${items.length} new_posts=${fresh.length}`);
for (const p of fresh) console.log(`  ${p.date.slice(0, 10)} @${p.account} ${p.text.replace(/\s+/g, ' ').slice(0, 90)}`);
await closeStore();
