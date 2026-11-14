import { buildKnowledge } from '../lib/knowledge.js';
import { closeStore } from '../lib/store.js';

await buildKnowledge();
await closeStore();
