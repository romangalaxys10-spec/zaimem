/**
 * ZaiMem Vector Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Local, deterministic text embeddings via hashed word + character n-grams.
 * No external API required — vectors are computed on-device and stored as
 * JSON float arrays in SQLite. Cosine similarity powers semantic recall.
 *
 * Design:
 *  - Word-level tokens capture vocabulary semantics
 *  - Char 4-grams capture morphology & typos ("authentcation" ~ "authentication")
 *  - Sublinear TF damping (1 + log tf) + unit normalization
 *  - DIM = 384, hash = FNV-1a with dual seeding for lower collision rate
 */

export const EMBED_DIM = 384;

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "of", "to", "in", "on",
  "at", "by", "for", "with", "about", "as", "is", "are", "was", "were", "be",
  "been", "being", "it", "its", "this", "that", "these", "those", "i", "you",
  "he", "she", "we", "they", "me", "him", "her", "us", "them", "my", "your",
  "his", "our", "their", "do", "does", "did", "so", "no", "not", "can", "will",
  "just", "s",
]);

/** FNV-1a 32-bit hash */
function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[`~!@#$%^&*()_\-+=[\]{};:'"\\|,.<>/?\u2014\u2013\u2018\u2019\u201c\u201d]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && w.length < 40 && !STOP_WORDS.has(w));
}

function charNgrams(word: string, n = 4): string[] {
  if (word.length <= n) return [word];
  const grams: string[] = [];
  for (let i = 0; i <= word.length - n; i++) grams.push(word.slice(i, i + n));
  return grams;
}

/**
 * Compute a normalized dense embedding for arbitrary text.
 */
export function embed(text: string): Float64Array {
  const vec = new Float64Array(EMBED_DIM);
  const words = tokenizeWords(text);
  if (words.length === 0) return vec;

  const bump = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    const idx = h % EMBED_DIM;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    vec[idx] += sign * weight;
    // second independent projection reduces collisions
    const h2 = fnv1a(feature, 0x9e3779b1);
    const idx2 = h2 % EMBED_DIM;
    const sign2 = (h2 >>> 31) & 1 ? -1 : 1;
    vec[idx2] += sign2 * weight * 0.5;
  };

  // word features (weight 1.0), sublinear tf
  const tf = new Map<string, number>();
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
  for (const [w, f] of tf) bump("w:" + w, 1 + Math.log(f));

  // bigram features (weight 1.2) — local word order
  for (let i = 0; i < words.length - 1; i++) {
    bump("b:" + words[i] + "_" + words[i + 1], 1.2);
  }

  // char 4-gram features (weight 0.5) — morphology robustness
  const gramTf = new Map<string, number>();
  for (const w of words) {
    for (const g of charNgrams(w)) gramTf.set(g, (gramTf.get(g) ?? 0) + 1);
  }
  for (const [g, f] of gramTf) bump("g:" + g, 0.5 * (1 + Math.log(f)));

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;
  return vec;
}

export function embedToJson(vec: Float64Array): string {
  const out = new Array<number>(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = Math.round(vec[i] * 1e5) / 1e5;
  return JSON.stringify(out);
}

export function embedFromJson(json: string): Float64Array {
  const arr = JSON.parse(json) as number[];
  return Float64Array.from(arr);
}

export function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // both normalized
}

/** Extract lightweight keywords for display & filtering. */
export function extractKeywords(text: string, max = 8): string[] {
  const tf = new Map<string, number>();
  for (const w of tokenizeWords(text)) tf.set(w, (tf.get(w) ?? 0) + 1);
  return [...tf.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([w]) => w);
}
