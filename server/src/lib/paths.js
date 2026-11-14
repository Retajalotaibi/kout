import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

export const DATA = path.join(ROOT, 'data');
export const CONFIG = path.join(ROOT, 'config');
export const PROMPTS = path.join(ROOT, 'prompts');

export function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const txt = fs.readFileSync(file, 'utf-8').trim();
    return txt ? JSON.parse(txt) : fallback;
  } catch (err) {
    console.error(`[readJSON] ${file}: ${err.message}`);
    return fallback;
  }
}

export function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}
