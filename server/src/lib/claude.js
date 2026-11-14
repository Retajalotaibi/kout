import Anthropic from '@anthropic-ai/sdk';
import './paths.js';
import { load, save } from './store.js';

let client;
function getClient() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

export const CHAT_MODEL = () => process.env.CHAT_MODEL;
export const FAST_MODEL = () => process.env.FAST_MODEL;

// ---------------------------------------------------------------- spend tracking
// USD per million tokens (input, output). Thinking tokens are billed as output.
// Unknown models are priced like Sonnet so the estimate errs on the high side.
const PRICES = {
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};
const FALLBACK_PRICE = [2, 10];
const LLM_MAX_BUDGET_USD = () => parseFloat(process.env.LLM_MAX_BUDGET_USD) || 4;

function costOf(model, usage) {
  const [inUsd, outUsd] = PRICES[model] ?? FALLBACK_PRICE;
  const input =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * inUsd + (usage.output_tokens ?? 0) * outUsd) / 1e6;
}

export async function llmSpend() {
  const s = await load('llm_spend', {});
  const spentUsd = s.spent_usd ?? 0;
  const capUsd = LLM_MAX_BUDGET_USD();
  return { spentUsd, capUsd, remainingUsd: Math.max(0, capUsd - spentUsd), calls: s.calls ?? 0 };
}

async function recordSpend(model, usage) {
  const s = await load('llm_spend', {});
  const cost = costOf(model, usage);
  const next = {
    spent_usd: Math.round(((s.spent_usd ?? 0) + cost) * 1e6) / 1e6,
    calls: (s.calls ?? 0) + 1,
  };
  await save('llm_spend', next);
  console.log(
    `[llm] ${model} in=${usage.input_tokens} out=${usage.output_tokens} ` +
      `(thinking=${usage.output_tokens_details?.thinking_tokens ?? 0}) $${cost.toFixed(5)} total=$${next.spent_usd.toFixed(4)}`,
  );
}

// ---------------------------------------------------------------- JSON helpers
/** Strip code fences and parse JSON; on failure log the raw text and return fallback. */
export function parseJSON(text, fallback) {
  let t = String(text ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    // Try the outermost {...} or [...] in case the model added prose.
    const m = t.match(/[\[{][\s\S]*[\]}]/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    console.error('[parseJSON] could not parse model output:\n', text);
    return fallback;
  }
}

/**
 * Call a model and parse its JSON reply.
 * `user` is a string or a full messages array.
 * Refuses to call once the local spend cap (LLM_MAX_BUDGET_USD) is reached.
 */
export async function callJSON(model, system, user, { maxTokens = 2048, effort = 'low', fallback = null } = {}) {
  const { spentUsd, capUsd } = await llmSpend();
  if (spentUsd >= capUsd) {
    console.error(`[callJSON] LLM budget cap reached ($${spentUsd.toFixed(4)} of $${capUsd}); skipping call.`);
    return fallback;
  }
  const messages = typeof user === 'string' ? [{ role: 'user', content: user }] : user;
  try {
    const res = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      output_config: { effort },
      system,
      messages,
    });
    await recordSpend(model, res.usage);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      console.warn(`[callJSON] ${model} stop_reason=${res.stop_reason}`);
    }
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseJSON(text, fallback);
  } catch (err) {
    console.error(`[callJSON] ${model}: ${err.status ?? ''} ${err.message}`);
    return fallback;
  }
}

/** Free connectivity check: look up a model ID (models API calls are not billed). */
export async function checkModel(model) {
  if (!model) return { ok: false, error: 'model not set in .env' };
  try {
    const info = await getClient().models.retrieve(model);
    return { ok: true, model: info.id };
  } catch (err) {
    return { ok: false, model, error: `${err.status ?? ''} ${err.message}`.trim() };
  }
}
