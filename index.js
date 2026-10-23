// fzy-search — fuzzy filter + sort for client-side lists. No dependencies.
//
//   const index = createIndex(formations, 'name');   // once
//   search('sicences donnes', index, { limit: 20 });
//   // -> [{ item, key, score, i }, ...] sorted by descending score
//
// createIndex takes an array of strings, an array of objects with a key name,
// a dotted path, an accessor function, or a plain object map. See accessor().
//
// Read in this order: normalize / osa / index / wordScore / vocabHits / search.
// search() is the whole hot path and is documented step by step there.
// Highlighting is independent — ranges() and highlight() at the bottom.
//
// The scoring constants below are tiered so the tiers can never cross. Extend
// test.js before touching one: that is the file that fails loudly when a magic
// number is nudged to fix a single query.

/** A search hit: the original item, its key (or row index), the score, the row id.
 *  @typedef {{ item: any, key: string | number, score: number, i: number }} SearchResult */

/**
 * A built index. Create it with createIndex(); the fields are internal except
 * where a function's doc says otherwise.
 * @typedef {Object} FzyIndex
 * @property {Array<any>} items                     the original rows
 * @property {Array<string|number>|null} keys       object keys, or null for arrays
 * @property {string[]} texts                       normalized row text
 * @property {Int32Array[]} words                   word boundaries, flat [start, end, ...]
 * @property {Map<string, number[]>} vocab          word -> (rowId, wordPos) postings
 * @property {string[]} vWord                       vocabulary as parallel arrays,
 * @property {number[][]} vPost                     so vocabHits is a loop over
 * @property {Int32Array} vMask                     primitives, not a Map
 * @property {Int32Array} vLen                      iteration
 * @property {(row: any) => string} getText         the accessor, for highlighting
 */

const COMBINING = /[̀-ͯ]/g;
const LIGATURES = { æ: 'ae', œ: 'oe', ß: 'ss', ø: 'o', đ: 'd', ł: 'l', '’': ' ', "'": ' ' };

/** Lowercase, de-accent, de-ligature. `map[i]` = index in the source string.
 *  @param {string} str  @returns {{ text: string, map: number[] }} */
export function normalize(str) {
  let text = '';
  const map = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    let out;
    if (ch.charCodeAt(0) < 128) out = ch.toLowerCase();
    else {
      const low = ch.toLowerCase();
      out = LIGATURES[low] ?? low.normalize('NFD').replace(COMBINING, '');
    }
    for (let k = 0; k < out.length; k++) { text += out[k]; map.push(i); }
  }
  return { text, map };
}

/** Word boundaries as a flat [start, end, start, end, ...] array. */
function bounds(text) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text.charCodeAt(i) : 32;
    const alnum = (c >= 97 && c <= 122) || (c >= 48 && c <= 57);
    if (alnum && start < 0) start = i;
    else if (!alnum && start >= 0) { out.push(start, i); start = -1; }
  }
  return out;
}

const tokenize = (text) => { const b = bounds(text), w = []; for (let i = 0; i < b.length; i += 2) w.push(text.slice(b[i], b[i + 1])); return w; };

/** Bitmask of the a-z letters present in `text` (bit 26 = any digit). */
function charMask(text) {
  let m = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 97 && c <= 122) m |= 1 << (c - 97);
    else if (c >= 48 && c <= 57) m |= 1 << 26;
  }
  return m;
}

const popcount = (n) => { n -= (n >> 1) & 0x55555555; n = (n & 0x33333333) + ((n >> 2) & 0x33333333); return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24; };

// --- Damerau-Levenshtein (OSA), banded: stops as soon as it exceeds `tol` ---
// Three reusable row buffers, grown on demand — a pathologically long word is
// edit-matched like any other rather than silently rejected past 80 chars.
let R0 = new Int32Array(80), R1 = new Int32Array(80), R2 = new Int32Array(80);
export function osa(a, b, tol) {
  const n = a.length, m = b.length;
  if (n - m > tol || m - n > tol) return tol + 1;
  const INF = tol + 1;
  if (m >= R0.length) {
    R0 = new Int32Array(m + 1); R1 = new Int32Array(m + 1); R2 = new Int32Array(m + 1);
  }
  let p2 = R0, p1 = R1, cur = R2;
  p2.fill(INF, 0, m + 1);
  for (let j = 0; j <= m; j++) p1[j] = j;
  for (let i = 1; i <= n; i++) {
    const lo = i - tol > 1 ? i - tol : 1, hi = i + tol < m ? i + tol : m;
    cur[0] = i;
    for (let j = 1; j < lo; j++) cur[j] = INF;
    let best = INF;
    const ai = a.charCodeAt(i - 1), ap = i > 1 ? a.charCodeAt(i - 2) : -1;
    for (let j = lo; j <= hi; j++) {
      const bj = b.charCodeAt(j - 1);
      let v = p1[j - 1] + (ai === bj ? 0 : 1);
      if (p1[j] + 1 < v) v = p1[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && ap === bj && p2[j - 2] + 1 < v) v = p2[j - 2] + 1;
      cur[j] = v;
      if (v < best) best = v;
    }
    for (let j = hi + 1; j <= m; j++) cur[j] = INF;
    if (best > tol) return INF;
    const t = p2; p2 = p1; p1 = cur; cur = t;
  }
  return p1[m] <= tol ? p1[m] : INF;
}

/** How many edits we forgive in a word of length n. */
export const tolerance = (n) => (n <= 3 ? 0 : n <= 7 ? 1 : 2);

/**
 * The knobs of search(). Every default reproduces the behaviour before the
 * knobs existed, so a caller that passes nothing sees no change.
 * @typedef {Object} SearchOptions
 * @property {number}  [limit=Infinity]      maximum number of results
 * @property {boolean} [prefix=true]         a query word matches the start of a longer word
 * @property {boolean} [infix=true]          a query word matches the inside of a longer word
 * @property {number}  [maxEdits=Infinity]   cap on the edits forgiven per word (the default budget is 0/1/2 by length)
 * @property {number}  [minTypoLength=0]     query words shorter than this are never edit-matched
 * @property {boolean} [keepInitial=false]   an edit-matched word must start with the same letter as the query word
 * @property {number}  [minCoverage=0]       0..1, share of the row's letters the query words must account for
 * @property {number}  [minScore=-Infinity]  drop rows scoring below this
 */
const DEFAULTS = { limit: Infinity, prefix: true, infix: true, maxEdits: Infinity, minTypoLength: 0, keepInitial: false, minCoverage: 0, minScore: -Infinity };

/** Edits forgiven for query word `q` under `o`. Always a small integer: min() against the
 *  default `Infinity` made V8 treat the budget as a double, which slowed osa() ~1.8x. */
const budget = (q, o) => {
  const t = tolerance(q.length);
  return q.length < o.minTypoLength ? 0 : t < o.maxEdits ? t : o.maxEdits | 0;
};

// --- index ----------------------------------------------------------------
/** What to read from each entry:
 *    undefined  the entry is already a string
 *    'name'     a property, dotted paths allowed ('meta.title')
 *    fn         anything you like
 *  Missing values read as the empty string rather than throwing. */
function accessor(key) {
  if (typeof key === 'function') return (x) => key(x) ?? '';
  if (typeof key !== 'string') return (x) => (typeof x === 'string' ? x : String(x ?? ''));
  const path = key.split('.');
  if (path.length === 1) return (x) => x?.[key] ?? '';
  return (x) => { let v = x; for (const k of path) v = v?.[k]; return v ?? ''; };
}

// Per item: normalized text + word offsets. Plus an inverted index word -> items,
// which is what keeps the search sub-millisecond: fuzzy matching runs against the
// vocabulary once per query, never against every row.
/**
 * Build a search index from a data source.
 * @param {Array<any>|Object<string, any>} source  rows to index
 * @param {string|((row: any) => string)|null} [key]  where to read the text
 * @returns {FzyIndex}
 * @throws {TypeError} if `source` is not an array or a plain object
 */
export function createIndex(source, key) {
  if (typeof source !== 'object' || source === null)
    throw new TypeError('createIndex: source must be an array of rows or a plain object map');
  const getText = accessor(key);
  const keys = Array.isArray(source) ? null : Object.keys(source);
  const items = keys ? keys.map((k) => source[k]) : source;
  const n = items.length;
  const texts = new Array(n), words = new Array(n);
  const vocab = new Map();
  for (let i = 0; i < n; i++) {
    const t = normalize(String(getText(items[i]))).text;
    texts[i] = t;
    const b = bounds(t);
    words[i] = Int32Array.from(b);       // offsets, not substrings: ~2.5x less heap
    for (let k = 0; k < b.length; k += 2) {
      const w = t.slice(b[k], b[k + 1]);
      const post = vocab.get(w);
      // (row, word position) pairs; only the first occurrence in a row is kept
      if (post === undefined) vocab.set(w, [i, k >> 1]);
      else if (post[post.length - 2] !== i) post.push(i, k >> 1);
    }
  }
  // Vocabulary as parallel arrays, so resolving a query word is a tight loop
  // over primitives instead of a Map iteration.
  const size = vocab.size;
  const vWord = new Array(size), vPost = new Array(size);
  const vMask = new Int32Array(size), vLen = new Int32Array(size);
  let k = 0;
  for (const [w, post] of vocab) {
    vWord[k] = w; vPost[k] = post; vMask[k] = charMask(w); vLen[k] = w.length; k++;
  }
  return { items, keys, texts, words, vocab, vWord, vPost, vMask, vLen, getText,
           _hits: new Int32Array(n), _seen: new Int32Array(n), _gen: 0, _maps: [] };
}

// --- scoring cascade ------------------------------------------------------
// Tiers never overlap: exact 1000 > prefix 900 > substring 800 > per-word <= 170.
// Runs once per vocabulary word. `tol` and the switches are resolved once per query word by
// the caller and passed as plain arguments, not read off the options object here.
function wordScore(q, w, tol, prefix, infix, keepInitial) {
  if (w === q) return 100;
  if (prefix && w.length > q.length && w.startsWith(q)) return 90 - Math.min(9, w.length - q.length);
  const at = infix && q.length >= 3 ? w.indexOf(q) : -1;   // no infix match on 1-2 letters:
  if (at > 0) return 70;                                   // "de" must not match "monde"
  if (tol === 0) return 0;
  if (keepInitial && w.charCodeAt(0) !== q.charCodeAt(0)) return 0;
  const cut = w.length > q.length + tol ? w.slice(0, q.length + tol) : w;
  const d = osa(q, cut, tol);
  return d <= tol ? 62 - 12 * d - (cut === w ? 0 : 4) : 0;
}

/** Postings lists of every vocabulary word reachable from `q`, with their score.
 *
 *  Two integer rejects come first, and both are exact — they can only drop words
 *  wordScore() would have scored 0 anyway:
 *    - a word shorter than `q` minus the edit budget cannot be within budget,
 *      and cannot contain `q` either;
 *    - `q` matches only as an equal string, a prefix, an infix or within `tol`
 *      edits, so a letter of `q` that the word does not contain at all costs at
 *      least one edit. More than `tol` such letters and the word is out.
 *  This is what keeps a 46 000-word vocabulary off the hot path. */
function vocabHits(q, index, o = DEFAULTS) {
  const { vWord, vPost, vMask, vLen } = index;
  const tol = budget(q, o), { prefix, infix, keepInitial } = o;
  const qMask = charMask(q), minLen = q.length - tol;
  const posts = [], scores = [];
  for (let k = 0; k < vWord.length; k++) {
    if (vLen[k] < minLen) continue;
    if (popcount(qMask & ~vMask[k]) > tol) continue;
    const s = wordScore(q, vWord[k], tol, prefix, infix, keepInitial);
    if (s > 0) { posts.push(vPost[k]); scores.push(s); }
  }
  return { posts, scores };
}

/** Scratch buffers, one pair per query word, reused across searches. */
function scratch(index, slots, n) {
  const pool = index._pool ?? (index._pool = []);
  while (pool.length < slots) pool.push({ score: new Float32Array(n), pos: new Int32Array(n) });
  return pool;
}

/** "artdesign" -> ["art", "design"], when the user dropped a space. */
function unglue(q, vocab) {
  for (let k = 3; k <= q.length - 3; k++) {
    const a = q.slice(0, k), b = q.slice(k);
    if (vocab.has(a) && vocab.has(b)) return [a, b];
  }
  return null;
}

/** Letters and digits in row `i`: what a query has to account for to "cover" it. */
function letters(index, i) {
  const w = index.words[i];
  let n = 0;
  for (let k = 0; k < w.length; k += 2) n += w[k + 1] - w[k];
  return n || 1;
}

/** Normalize + collapse whitespace, shared by search() and ranges(). Non-string
 *  queries (null, numbers) read as their string form or empty, never throw. */
function qNorm(query) {
  return normalize(String(query ?? '')).text.trim().replace(/\s+/g, ' ');
}

/** Fallback for queries the inverted index cannot see at all: a query with no
 *  ASCII word characters — a non-Latin script (bounds() only knows a-z0-9), or
 *  a symbol. A substring scan over the normalized texts keeps such queries from
 *  being a silent miss. No fuzz here; punctuation-only queries stay empty. */
function substrScan(qText, index, limit) {
  let nonAscii = false;
  for (let k = 0; k < qText.length; k++)
    if (qText.charCodeAt(k) > 0x7f) { nonAscii = true; break; }
  if (!nonAscii) return [];
  const out = [];
  for (let i = 0; i < index.texts.length; i++) {
    const text = index.texts[i];
    const at = text.indexOf(qText);
    if (at < 0) continue;
    out.push({ item: index.items[i], key: index.keys ? index.keys[i] : i,
               score: text === qText ? 1000 : at === 0 ? 900 : 800 + 1 / (1 + at), i });
  }
  out.sort((a, b) => b.score - a.score);
  return limit < out.length ? out.slice(0, limit) : out;
}

/**
 * Fuzzy filter + sort. @param {string} query  @param {FzyIndex} index
 * @param {SearchOptions} [opts]
 * @returns {SearchResult[]}
 */
export function search(query, index, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const limit = o.limit;
  if (limit <= 0) return [];
  const qText = qNorm(query);
  if (!qText) return [];
  const raw = tokenize(qText);
  if (!raw.length) return substrScan(qText, index, limit);

  // 1. resolve each query word against the vocabulary — once, not per row
  const qWords = [], matches = [];
  for (const q of raw) {
    const hit = vocabHits(q, index, o);
    const parts = hit.posts.length ? null : unglue(q, index.vocab);
    for (const w of parts ?? [q]) { qWords.push(w); matches.push(parts ? vocabHits(w, index, o) : hit); }
  }
  const need = qWords.length;
  let covered = 0;
  for (const q of qWords) covered += q.length;

  // 2. walk the postings: this both finds the candidates and scores every
  //    query word against them, so no row text is touched yet
  const n = index.texts.length;
  const { _hits: hits, _seen: seen } = index;
  const pool = scratch(index, need, n);
  hits.fill(0);
  let matched = 0;
  for (let k = 0; k < need; k++) {
    const gen = ++index._gen;
    const { posts, scores } = matches[k];
    const bestScore = pool[k].score, bestPos = pool[k].pos;
    for (let m = 0; m < posts.length; m++) {
      const post = posts[m], s = scores[m];
      for (let p = 0; p < post.length; p += 2) {
        const id = post[p];
        if (seen[id] !== gen) { seen[id] = gen; if (++hits[id] === need) matched++; bestScore[id] = s; bestPos[id] = post[p + 1]; }
        else if (s > bestScore[id]) { bestScore[id] = s; bestPos[id] = post[p + 1]; }
      }
    }
  }
  if (!matched) return [];

  // 3. only rows that satisfy every query word reach the cascade. Note the
  //    first three tiers look at the WHOLE query: any substring hit of the full
  //    query outranks a perfect per-word match (~170 is the word-level ceiling).
  //    With a limit, keep a running top-N instead of sorting every match:
  //    a one-letter-ish query can match 40 000 rows to show ten.
  const out = [];
  const capped = limit < n;
  let floor = -Infinity;
  for (let i = 0; i < n; i++) {
    if (hits[i] !== need) continue;
    const text = index.texts[i];
    let score;
    if (text === qText) score = 1000;
    else if (o.prefix && text.startsWith(qText)) score = 900;
    else {
      const at = o.infix ? text.indexOf(qText) : -1;
      if (at > 0) score = 800 + 1 / (1 + at);        // earlier match ranks higher
      else {
        let total = 0, last = -1, ordered = true;
        for (let k = 0; k < need; k++) {
          total += pool[k].score[i];
          const at2 = pool[k].pos[i];
          if (at2 < last) ordered = false;
          last = at2;
        }
        score = total / need + (ordered ? 30 : 0) + 40 * (covered / text.length);
      }
    }
    if (score < o.minScore) continue;
    if (o.minCoverage > 0 && covered / letters(index, i) < o.minCoverage) continue;
    if (capped && out.length === limit && score <= floor) continue;
    const row = { item: index.items[i], key: index.keys ? index.keys[i] : i, score, i };
    if (!capped) { out.push(row); continue; }
    let j = out.length - 1;
    out.push(row);
    while (j >= 0 && out[j].score < score) { out[j + 1] = out[j]; j--; }
    out[j + 1] = row;
    if (out.length > limit) out.pop();
    floor = out[out.length - 1].score;
  }
  if (!capped) out.sort((a, b) => b.score - a.score);
  return out;
}

// --- highlighting ---------------------------------------------------------
/** Ranges [start, end) in the ORIGINAL string of `item`, for <mark> rendering.
 *  @param {string} query  @param {FzyIndex} index  @param {number} i
 *  @returns {Array<[number, number]>} */
export function ranges(query, index, i) {
  const src = index.getText(index.items[i]);
  // The normalize map is cached per row, lazily: only rows that ever get
  // highlighted pay for it, so the index keeps its memory profile.
  const norm = index._maps[i] ?? (index._maps[i] = normalize(src));
  const { text, map } = norm;
  const qText = qNorm(query);
  const spans = [];
  const push = (s, e) => spans.push([map[s], (map[e - 1] ?? map.length - 1) + 1]);
  const at = text.indexOf(qText);
  if (at >= 0) push(at, at + qText.length);
  else {
    const b = bounds(text);
    for (const q of tokenize(qText)) {
      let best = 0, span = null;
      for (let bi = 0; bi < b.length; bi += 2) {
        const off = b[bi], w = text.slice(off, b[bi + 1]);
        const s = wordScore(q, w, tolerance(q.length), true, true, false);
        if (s > best) { best = s; const k = w.indexOf(q); span = k > 0 ? [off + k, off + k + q.length] : [off, off + Math.min(w.length, q.length + 2)]; }
      }
      if (span) push(span[0], span[1]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of spans) {
    const prev = merged[merged.length - 1];
    if (prev && s[0] <= prev[1]) prev[1] = Math.max(prev[1], s[1]);
    else merged.push(s.slice());
  }
  return merged;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
/** Highlighted HTML for row `i`, escaping everything outside the tags.
 *  @param {string} query  @param {FzyIndex} index  @param {number} i
 *  @param {string} [tag]  @returns {string} */
export function highlight(query, index, i, tag = 'mark') {
  const src = index.getText(index.items[i]);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ESC[c]);
  let html = '', at = 0;
  for (const [s, e] of ranges(query, index, i)) {
    html += esc(src.slice(at, s)) + `<${tag}>` + esc(src.slice(s, e)) + `</${tag}>`;
    at = e;
  }
  return html + esc(src.slice(at));
}
