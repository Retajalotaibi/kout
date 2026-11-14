async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const health = () => request('/api/health');
export const stats = () => request('/api/stats');
export const posts = () => request('/api/posts');
