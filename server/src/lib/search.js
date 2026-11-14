// Arabic-aware BM25 (k1 = 1.5, b = 0.75), plain JS.
const K1 = 1.5;
const B = 0.75;
const TOP_K = 12;
const TOPIC_BOOST = 1.2;

const STOPWORDS = new Set([
  // Arabic (normalized forms)
  'في', 'من', 'الي', 'علي', 'عن', 'مع', 'او', 'و', 'ثم', 'هل', 'ما', 'ماذا', 'كم', 'كيف', 'متي', 'اين', 'هو', 'هي',
  'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'الذين', 'ان', 'انا', 'نحن', 'هم', 'لا', 'لم', 'لن', 'قد', 'كل', 'اي',
  'بعد', 'قبل', 'عند', 'لكل', 'به', 'بها', 'له', 'لها', 'يا', 'ايش', 'شنو', 'وش', 'اذا', 'لو', 'تم', 'كان',
  // English
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was', 'be', 'do', 'does', 'i', 'my', 'me',
  'what', 'how', 'much', 'many', 'when', 'where', 'which', 'who', 'can', 'it', 'this', 'that', 'with', 'by', 'at', 'from',
  'need', 'there', 'any', 'you', 'your', 'about', 'if', 'as', 'have', 'has',
]);

export function normalize(text) {
  return String(text ?? '')
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // diacritics
    .replace(/ـ/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
}

function stem(tok) {
  // Prefixed definite article (و/ب/ف/ك + ال, or لل), then plain ال on tokens longer than 3 letters.
  if (/^[وبفك]ال/.test(tok) && tok.length > 5) return tok.slice(3);
  if (tok.startsWith('لل') && tok.length > 4) return tok.slice(2);
  if (tok.startsWith('ال') && tok.length > 3) return tok.slice(2);
  return tok;
}

export function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
    .filter((t) => t && !STOPWORDS.has(t));
}

export class Index {
  constructor(items) {
    this.items = items;
    this.docs = items.map((it) => {
      const toks = tokenize(it.searchText);
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      return { tf, len: toks.length };
    });
    this.N = this.docs.length;
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / (this.N || 1);
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  idf(t) {
    const n = this.df.get(t) ?? 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }

  /** Search with the question plus expansion keywords; optional topic boost. */
  search(query, keywords = [], topic = null, k = TOP_K) {
    const qTokens = [...new Set(tokenize([query, ...keywords].join(' ')))];
    if (!qTokens.length) return [];
    const results = [];
    this.docs.forEach((d, i) => {
      let score = 0;
      for (const t of qTokens) {
        const f = d.tf.get(t);
        if (!f) continue;
        score += this.idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / (this.avgdl || 1))));
      }
      if (score <= 0) return;
      if (topic && this.items[i].topic === topic) score *= TOPIC_BOOST;
      results.push({ item: this.items[i], score });
    });
    results.sort((a, b) => b.score - a.score || String(b.item.date).localeCompare(String(a.item.date)));
    return results.slice(0, k);
  }
}
