import path from 'node:path';
import { DATA, readJSON, writeJSON } from './paths.js';

export const POSTS_FILE = path.join(DATA, 'posts.json');

/** Append items to posts.json, de-duplicated by id. Returns the posts that were new. */
export function appendPosts(items) {
  const posts = readJSON(POSTS_FILE, []);
  const ids = new Set(posts.map((p) => p.id));
  const fresh = items.filter((p) => p?.id && !ids.has(p.id));
  writeJSON(POSTS_FILE, [...posts, ...fresh]);
  return fresh;
}
