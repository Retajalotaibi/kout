import { load, save } from './store.js';

export const loadPosts = () => load('posts', []);

/** Append items to the stored posts, de-duplicated by id. Returns the posts that were new. */
export async function appendPosts(items) {
  const posts = await loadPosts();
  const ids = new Set(posts.map((p) => p.id));
  const fresh = items.filter((p) => p?.id && !ids.has(p.id));
  if (fresh.length) await save('posts', [...posts, ...fresh]);
  return fresh;
}
