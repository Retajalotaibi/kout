// Port of reference/x_source.py — budget-safe ingestion of official posts from the X API.
// Cost-saving rules (do not remove):
//   1. Usernames resolved to IDs ONCE (batched) and cached in data/state.json.
//   2. since_id stored per account, so each poll only returns unseen posts.
//   3. No author_id expansion (it would bill a user read on every call).
//   4. exclude=retweets,replies.
//   5. Local BudgetGuard refuses calls that would exceed X_MAX_BUDGET_USD.
//   6. Falls back to data/fixtures.json when there is no token, no accounts or no budget.
// Changes vs. the Python original (cost behaviour unchanged):
//   - Usernames are matched case-insensitively (X returns canonical casing).
//   - Budget running out during ID resolution falls back to fixtures instead of throwing.
//   - If every account request fails (e.g. offline), falls back to fixtures.
import path from 'node:path';
import { CONFIG, DATA, readJSON } from './paths.js';
import { load, save } from './store.js';

const API = 'https://api.x.com/2';
const num = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

const POST_READ_USD = () => num(process.env.X_POST_READ_USD, 0.005);
const USER_READ_USD = () => num(process.env.X_USER_READ_USD, 0.01);
const MAX_BUDGET_USD = () => num(process.env.X_MAX_BUDGET_USD, 3);
const FIRST_RUN_POSTS_PER_ACCOUNT = 10;
const POLL_POSTS_PER_ACCOUNT = 20;

const FIXTURE_FILE = path.join(DATA, 'fixtures.json');
const ACCOUNTS_FILE = path.join(CONFIG, 'accounts.json');

class BudgetExceeded extends Error {}

export function makeItem(id, account, date, text, lang, images, links) {
  return { id, account, date, text, lang, images, links, url: `https://x.com/${account}/status/${id}` };
}

// ---------------------------------------------------------------- state + budget
export async function loadState() {
  const s = await load('state', {});
  return {
    user_ids: s.user_ids ?? {},   // lowercased username -> { id, username }
    since_ids: s.since_ids ?? {}, // lowercased username -> newest id
    spent_usd: s.spent_usd ?? 0,
    last_poll: s.last_poll ?? null,
  };
}

async function saveState(state) {
  await save('state', state);
}

export class BudgetGuard {
  constructor(state, capUsd) {
    this.state = state;
    this.cap = capUsd;
  }
  get remaining() {
    return Math.max(0, this.cap - this.state.spent_usd);
  }
  maxAffordable(unitCost) {
    return Math.floor(this.remaining / unitCost + 1e-9);
  }
  charge(count, unitCost) {
    this.state.spent_usd = Math.round((this.state.spent_usd + count * unitCost) * 10000) / 10000;
  }
}

export async function budgetSnapshot() {
  const state = await loadState();
  const b = new BudgetGuard(state, MAX_BUDGET_USD());
  return { spentUsd: state.spent_usd, remainingUsd: Math.round(b.remaining * 10000) / 10000, capUsd: b.cap, lastPoll: state.last_poll };
}

export function enabledAccounts() {
  const accounts = readJSON(ACCOUNTS_FILE, [])
    .filter((a) => a.enabled && a.handle && a.handle !== 'TODO')
    .map((a) => ({ ...a, handle: a.handle.replace(/^@/, '') }));
  // Optional X_ACCOUNTS=handle1,handle2 limits a poll to a subset (cheap testing).
  const only = (process.env.X_ACCOUNTS ?? '').split(',').map((h) => h.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  return only.length ? accounts.filter((a) => only.includes(a.handle.toLowerCase())) : accounts;
}

// ---------------------------------------------------------------- live source
class XApiSource {
  constructor(token, accounts, state, budget) {
    this.token = token;
    this.accounts = accounts;
    this.state = state;
    this.budget = budget;
    this.anySuccess = false;
  }

  async get(p, params) {
    const url = `${API}${p}?${new URLSearchParams(params)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (resp.status === 429) {
      const reset = parseInt(resp.headers.get('x-rate-limit-reset') ?? '', 10) || Math.floor(Date.now() / 1000) + 60;
      throw new Error(`Rate limited until ${new Date(reset * 1000).toISOString()}`);
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    return resp.json();
  }

  async resolveUserIds() {
    const missing = this.accounts.filter((a) => !this.state.user_ids[a.toLowerCase()]);
    if (!missing.length) return;
    if (this.budget.maxAffordable(USER_READ_USD()) < missing.length) {
      throw new BudgetExceeded('Not enough budget to resolve account IDs');
    }
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      const data = await this.get('/users/by', { usernames: chunk.join(',') });
      const users = data.data ?? [];
      this.budget.charge(users.length, USER_READ_USD());
      for (const u of users) this.state.user_ids[u.username.toLowerCase()] = { id: u.id, username: u.username };
      for (const err of data.errors ?? []) console.warn(`[x] could not resolve ${err.value}: ${err.detail}`);
    }
  }

  async fetchAccount(handle) {
    const key = handle.toLowerCase();
    const user = this.state.user_ids[key];
    if (!user) return [];

    const sinceId = this.state.since_ids[key];
    const wanted = sinceId ? POLL_POSTS_PER_ACCOUNT : FIRST_RUN_POSTS_PER_ACCOUNT;
    const limit = Math.min(wanted, this.budget.maxAffordable(POST_READ_USD()));
    if (limit < 5) throw new BudgetExceeded('Post-read budget used up'); // endpoint minimum max_results is 5

    const params = {
      max_results: String(Math.max(5, Math.min(limit, 100))),
      exclude: 'retweets,replies',
      'tweet.fields': 'created_at,lang,entities,attachments',
      expansions: 'attachments.media_keys',
      'media.fields': 'url,preview_image_url,type',
    };
    if (sinceId) params.since_id = sinceId;

    const data = await this.get(`/users/${user.id}/tweets`, params);
    this.anySuccess = true;
    const posts = data.data ?? [];
    this.budget.charge(posts.length, POST_READ_USD());
    if (!posts.length) return [];

    const media = Object.fromEntries((data.includes?.media ?? []).map((m) => [m.media_key, m]));
    const items = posts.map((p) => {
      const keys = p.attachments?.media_keys ?? [];
      const images = keys.filter((k) => media[k]).map((k) => media[k].url || media[k].preview_image_url).filter(Boolean);
      const links = (p.entities?.urls ?? [])
        .filter((u) => !/(^|\/\/|\.)(x|twitter)\.com/.test(u.expanded_url ?? ''))
        .map((u) => u.unwound_url || u.expanded_url)
        .filter(Boolean);
      return makeItem(p.id, user.username, p.created_at ?? '', p.text ?? '', p.lang ?? null, images, links);
    });

    // Posts come newest first; remember the newest so the next poll skips older ones.
    this.state.since_ids[key] = data.meta?.newest_id ?? posts[0].id;
    return items;
  }

  async fetchNew() {
    await this.resolveUserIds();
    const items = [];
    for (const handle of this.accounts) {
      try {
        items.push(...(await this.fetchAccount(handle)));
      } catch (err) {
        if (err instanceof BudgetExceeded) {
          console.warn('[x] budget cap reached; stopping this poll.');
          this.anySuccess = true; // budget stop is not a connectivity failure
          break;
        }
        console.error(`[x] failed to fetch ${handle}: ${err.message}`);
      }
    }
    return items;
  }
}

function fixtureItems() {
  const items = readJSON(FIXTURE_FILE, []);
  return Array.isArray(items) ? items : [];
}

// ---------------------------------------------------------------- entry point
/** One poll. Returns { items, source }. Call from the admin button, never a tight loop. */
export async function pollOnce() {
  const state = await loadState();
  const budget = new BudgetGuard(state, MAX_BUDGET_USD());
  const token = process.env.X_BEARER_TOKEN;
  const accounts = enabledAccounts().map((a) => a.handle);

  let items = [];
  let source = 'fixtures';
  try {
    if (token && accounts.length && budget.remaining > 0) {
      const live = new XApiSource(token, accounts, state, budget);
      try {
        items = await live.fetchNew();
        if (live.anySuccess) source = 'x_api';
        else console.warn('[x] no account request succeeded; falling back to fixtures.');
      } catch (err) {
        console.warn(`[x] live poll failed (${err.message}); falling back to fixtures.`);
      }
    }
    if (source === 'fixtures') items = fixtureItems();
  } finally {
    state.last_poll = new Date().toISOString();
    await saveState(state);
  }

  console.log(`[x] source=${source} items=${items.length} est_spent=$${state.spent_usd.toFixed(3)} remaining=$${budget.remaining.toFixed(3)}`);
  return { items, source };
}
