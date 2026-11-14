import { classifyNew } from '../lib/classify.js';
import { closeStore } from '../lib/store.js';

await classifyNew();
await closeStore();
