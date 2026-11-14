// Free, rule-based detection of "show me recent tweets" questions (Arabic + English).
// Full question answering (search + Claude) comes with /api/chat; this handles tweet lookups at $0.
import path from 'node:path';
import { CONFIG, readJSON } from './paths.js';

export const ENTITY_AR = {
  MOI: 'وزارة الداخلية',
  KUNA: 'كونا',
  'Council of Ministers': 'مجلس الوزراء',
  MOHE: 'وزارة التعليم العالي',
  PACI: 'الهيئة العامة للمعلومات المدنية',
};

const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;

function norm(text) {
  return String(text ?? '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase();
}

const TWEET_WORDS = /\b(tweets?|posts?|announcements?|updates?|x posts?)\b|تغريد|تويت|منشور|اعلان|تحديث|بوست/;

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  واحد: 1, اثنين: 2, ثنتين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5,
  ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10,
};

// Extra names people use for each entity, matched against config/accounts.json entities.
const ENTITY_ALIASES = {
  MOI: ['moi', 'interior', 'الداخليه', 'وزاره الداخليه'],
  KUNA: ['kuna', 'كونا', 'وكاله الانباء'],
  'Council of Ministers': ['council of ministers', 'cabinet', 'مجلس الوزراء'],
  MOHE: ['mohe', 'higher education', 'التعليم العالي'],
};

function findCount(t) {
  const digits = t.match(/\b(\d{1,2})\b/);
  if (digits) return Math.min(MAX_COUNT, Math.max(1, parseInt(digits[1], 10)));
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`(^|\\s)${word}(\\s|$)`).test(t)) return n;
  }
  if (/\b(latest|last|newest|most recent)\b/.test(t) && !/\b(tweets|posts|announcements|updates)\b/.test(t)) return 1;
  if (/(اخر|احدث) (تغريده|تويته|منشور|اعلان)(\s|$)/.test(t)) return 1;
  return DEFAULT_COUNT;
}

function findAccounts(t) {
  // All configured accounts (not only the ones polled now), so we can say "nothing stored from X yet".
  const accounts = readJSON(path.join(CONFIG, 'accounts.json'), [])
    .filter((a) => a.handle && a.handle !== 'TODO')
    .map((a) => ({ ...a, handle: a.handle.replace(/^@/, '') }));
  const hits = accounts.filter((a) => {
    const names = [a.handle, a.entity, ...(ENTITY_ALIASES[a.entity] ?? [])].map(norm);
    return names.some((n) => n && (t.includes(`@${n}`) || new RegExp(`(^|[^\\p{L}])${n}([^\\p{L}]|$)`, 'u').test(t)));
  });
  return hits.map((a) => ({ handle: a.handle, entity: a.entity }));
}

/** Returns { count, accounts, keptOnly, arabic } for a recent-tweets request, or null. */
export function parseTweetsQuery(message) {
  const t = norm(message);
  if (!TWEET_WORDS.test(t)) return null;
  return {
    count: findCount(t),
    accounts: findAccounts(t),
    keptOnly: /\b(useful|important|relevant|kept|official decisions?)\b|مهم|مفيد|قرار/.test(t),
    arabic: /[؀-ۿ]/.test(message),
  };
}
