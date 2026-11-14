import fs from 'node:fs';
import path from 'node:path';
import { PROMPTS } from './paths.js';

// Read fresh each call so prompt edits apply without a restart.
export function loadPrompt(name) {
  return fs.readFileSync(path.join(PROMPTS, `${name}.md`), 'utf-8');
}
