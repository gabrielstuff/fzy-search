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
// tests/index.test.ts before touching one: that is the file that fails loudly when
// a magic number is nudged to fix a single query.
//
// The doc comments on the exports are the published API documentation: `vp pack`
// copies them into dist/index.d.ts. The `//` comments are for whoever edits the code.

/**
 * A search hit.
 *
 * @typeParam Item - The row type that was indexed.
 */
export type SearchResult<Item = unknown> = {
  /** The original row. */
  readonly item: Item;

  /** The object key it was indexed under, or its array index. */
  readonly key: string | number;

  /** Descending relevance. See the scoring cascade in the readme. */
  readonly score: number;

  /** Internal row id. Pass it to `ranges()` and `highlight()`. */
  readonly i: number;
};

/**
 * A built index. Create it with {@link createIndex}. The fields are internal.
 */
export type FzyIndex<Item = unknown> = {
  readonly items: readonly Item[];
  readonly keys: readonly (string | number)[] | null;
  readonly texts: readonly string[];
  readonly getText: (row: Item) => string;
};

export type SearchOptions = {
  /**
   * Maximum number of results.
   *
   * With a limit, a running top-N replaces the sort, which matters when a short query matches tens of thousands of rows.
   *
   * @default Infinity
   */
  readonly limit?: number;

  /**
   * A query word matches the start of a longer word (`par` finds `paris`). Turn it off when the query is expected to be complete.
   *
   * @default true
   */
  readonly prefix?: boolean;

  /**
   * A query word matches the inside of a longer word. Never applies to words of 1-2 letters.
   *
   * @default true
   */
  readonly infix?: boolean;

  /**
   * Upper bound on the edits forgiven per query word. The built-in budget is {@link tolerance}: 0 edits up to 3 letters, 1 up to 7, 2 beyond. `maxEdits: 1` caps the long words at 1; `maxEdits: 0` turns typo matching off.
   *
   * @default Infinity
   */
  readonly maxEdits?: number;

  /**
   * Query words shorter than this are never edit-matched, whatever the budget says. Short words are where typo matching turns ordinary words into other ordinary words.
   *
   * @default 0
   */
  readonly minTypoLength?: number;

  /**
   * An edit-matched word must start with the same letter as the query word. Typos rarely hit the first letter, and requiring it removes most false positives at no cost to recall.
   *
   * @default false
   */
  readonly keepInitial?: boolean;

  /**
   * From 0 to 1: the share of a row's letters the query words must account for. `1` keeps rows the query spells out completely; it rejects `ferrandi` against `Clermont-Ferrand` (8 of 15 letters) while keeping `renned` against `Rennes`.
   *
   * @default 0
   */
  readonly minCoverage?: number;

  /**
   * Drop rows scoring below this. The score tiers are in the readme.
   *
   * @default -Infinity
   */
  readonly minScore?: number;
};

/**
 * Where to read the text from each row.
 *
 * - Omitted — the row is already a string.
 * - `'name'` — a property. Dotted paths allowed: `'meta.title'`.
 * - A function — anything you like.
 *
 * Missing, `null` and non-string values read as the empty string rather than throwing.
 */
export type Key<Item> = string | ((row: Item) => string) | null | undefined;

// What createIndex() really builds. The public FzyIndex type shows four fields; the
// rest is the inverted index and the scratch buffers search() reuses between calls.
type Posting = number[]; // flat (rowId, wordPos) pairs
type Normalized = { text: string; map: number[] };
type Index<Item> = FzyIndex<Item> & {
  items: Item[];
  keys: (string | number)[] | null;
  texts: string[];
  words: Int32Array[]; // word boundaries, flat [start, end, ...]
  vocab: Map<string, Posting>; // word -> postings
  vWord: string[]; // the vocabulary again, as parallel arrays,
  vPost: Posting[]; // so vocabHits is a loop over
  vMask: Int32Array; // primitives, not a Map
  vLen: Int32Array; // iteration
  getText: (row: Item) => string;
  _hits: Int32Array;
  _seen: Int32Array;
  _gen: number;
  _maps: (Normalized | undefined)[];
  _pool?: { score: Float32Array; pos: Int32Array }[];
};
type Options = { -readonly [K in keyof SearchOptions]-?: NonNullable<SearchOptions[K]> };

const COMBINING = /[̀-ͯ]/g;
const LIGATURES: Record<string, string> = { æ: 'ae', œ: 'oe', ß: 'ss', ø: 'o', đ: 'd', ł: 'l', '’': ' ' };
const NON_ASCII = /[^\0-\x7f]/;

/**
 * Lowercase, de-accent, de-ligature. `map[i]` is the index of that character in the source string, which is how highlighting points back into the original.
 *
 * Exported for testing and for reusing the same folding elsewhere.
 *
 * @example
 * ```
 * normalize('Œnologie');
 * //=> {text: 'oenologie', map: [0, 0, 1, 2, 3, 4, 5, 6, 7]}
 * ```
 */
export function normalize(string: string): Normalized {
  const map: number[] = [];
  return { text: fold(string, map), map };
}

// The folded text, and the map when one is passed. createIndex() and search() only need the text, and an
// ASCII string folds to its lowercase: no work per character, which is most of what indexing costs.
function fold(string: string, map?: number[]): string {
  if (!map && !NON_ASCII.test(string)) return string.toLowerCase();
  let text = '';
  for (let i = 0; i < string.length; i++) {
    const low = string[i].toLowerCase();
    const out = string.charCodeAt(i) < 128 ? low : (LIGATURES[low] ?? low.normalize('NFD').replace(COMBINING, ''));
    text += out;
    if (map) for (let k = 0; k < out.length; k++) map.push(i);
  }
  return text;
}

// Word boundaries as a flat [start, end, start, end, ...] array.
function bounds(text: string): number[] {
  const out: number[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text.charCodeAt(i) : 32;
    const alnum = (c >= 97 && c <= 122) || (c >= 48 && c <= 57);
    if (alnum && start < 0) start = i;
    else if (!alnum && start >= 0) {
      out.push(start, i);
      start = -1;
    }
  }
  return out;
}

const tokenize = (text: string): string[] => text.match(/[a-z0-9]+/g) ?? [];

// Bitmask of the a-z letters present in `text`, or in its first `end` characters (bit 26 = any digit).
function charMask(text: string, end = text.length): number {
  let m = 0;
  for (let i = 0; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c >= 97 && c <= 122) m |= 1 << (c - 97);
    else if (c >= 48 && c <= 57) m |= 1 << 26;
  }
  return m;
}

const popcount = (n: number): number => {
  n -= (n >> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
};

// --- Damerau-Levenshtein (OSA), banded: stops as soon as it exceeds `tol` ---
// Three reusable row buffers, grown on demand — a pathologically long word is
// edit-matched like any other rather than silently rejected past 80 chars.
let R0 = new Int32Array(80),
  R1 = new Int32Array(80),
  R2 = new Int32Array(80);

/**
 * Damerau-Levenshtein (optimal string alignment) distance, banded: it stops and returns `tol + 1` as soon as the edit budget is blown.
 *
 * A transposition costs one edit, not two, which is why `sicences` finds `sciences`.
 *
 * Exported for testing.
 *
 * @example
 * ```
 * osa('sicences', 'sciences', 2);
 * //=> 1
 * ```
 */
export function osa(a: string, b: string, tol: number): number {
  const n = a.length,
    m = b.length;
  if (n - m > tol || m - n > tol) return tol + 1;
  const INF = tol + 1;
  if (m >= R0.length) {
    R0 = new Int32Array(m + 1);
    R1 = new Int32Array(m + 1);
    R2 = new Int32Array(m + 1);
  }
  let p2 = R0,
    p1 = R1,
    cur = R2;
  p2.fill(INF, 0, m + 1);
  for (let j = 0; j <= m; j++) p1[j] = j;
  for (let i = 1; i <= n; i++) {
    const lo = i - tol > 1 ? i - tol : 1,
      hi = i + tol < m ? i + tol : m;
    cur[0] = i;
    for (let j = 1; j < lo; j++) cur[j] = INF;
    let best = INF;
    const ai = a.charCodeAt(i - 1),
      ap = i > 1 ? a.charCodeAt(i - 2) : -1;
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
    const t = p2;
    p2 = p1;
    p1 = cur;
    cur = t;
  }
  return p1[m] <= tol ? p1[m] : INF;
}

/**
 * How many edits are forgiven in a word of length `n` by default: 0 up to 3 letters, 1 up to 7, 2 beyond.
 *
 * Exported so a caller can reason about the budget it is capping.
 *
 * @example
 * ```
 * tolerance(6);
 * //=> 1
 * ```
 */
export const tolerance = (n: number): number => (n <= 3 ? 0 : n <= 7 ? 1 : 2);

// Every default reproduces the behaviour before the option existed, so a caller that
// passes nothing sees no change.
const DEFAULTS: Options = {
  limit: Infinity,
  prefix: true,
  infix: true,
  maxEdits: Infinity,
  minTypoLength: 0,
  keepInitial: false,
  minCoverage: 0,
  minScore: -Infinity,
};

// Edits forgiven for query word `q` under `o`. Always a small integer: min() against the
// default `Infinity` made V8 treat the budget as a double, which slowed osa() ~1.8x.
const budget = (q: string, o: Options): number => {
  const t = tolerance(q.length);
  return q.length < o.minTypoLength ? 0 : t < o.maxEdits ? t : o.maxEdits | 0;
};

// --- index ----------------------------------------------------------------
// What to read from each entry:
//   undefined  the entry is already a string
//   'name'     a property, dotted paths allowed ('meta.title')
//   fn         anything you like
// Missing values read as the empty string rather than throwing.
function accessor<Item>(key: Key<Item>): (row: Item) => string {
  if (typeof key === 'function') return (x) => key(x) ?? '';
  if (typeof key !== 'string') return (x) => (typeof x === 'string' ? x : String(x ?? ''));
  const path = key.split('.');
  // Inline optional chains, as in the JavaScript this was ported from: no helper call per row.
  type Bag = Record<string, unknown> | null | undefined;
  if (path.length === 1) return (x) => ((x as Bag)?.[key] ?? '') as string;
  return (x) => {
    let v: unknown = x;
    for (const k of path) v = (v as Bag)?.[k];
    return (v ?? '') as string;
  };
}

/**
 * Build a search index. Do this once, not per keystroke.
 *
 * @param source - The rows to index: an array, or a plain object map.
 * @param key - Where to read the text.
 *
 * @example
 * ```
 * import {createIndex, search} from 'fzy-search';
 *
 * const index = createIndex(['Master Sciences', 'CAP Pâtisserie']);
 *
 * search('patisserie', index);
 * //=> [{item: 'CAP Pâtisserie', key: 1, score: 800.2, i: 1}]
 * ```
 *
 * @throws {TypeError} If `source` is not an array or a plain object.
 */
export function createIndex<Item>(source: readonly Item[], key?: Key<Item>): FzyIndex<Item>;
export function createIndex<Item>(source: Readonly<Record<string, Item>>, key?: Key<Item>): FzyIndex<Item>;
export function createIndex<Item>(
  source: readonly Item[] | Readonly<Record<string, Item>>,
  key?: Key<Item>,
): FzyIndex<Item> {
  // Per item: normalized text + word offsets. Plus an inverted index word -> items,
  // which is what keeps the search sub-millisecond: fuzzy matching runs against the
  // vocabulary once per query, never against every row.
  if (typeof source !== 'object' || source === null)
    throw new TypeError('createIndex: source must be an array or an object');
  const getText = accessor(key);
  const keys = Array.isArray(source) ? null : Object.keys(source);
  const items = (keys ? keys.map((k) => (source as Record<string, Item>)[k]) : source) as Item[];
  const n = items.length;
  const texts: string[] = new Array(n),
    words: Int32Array[] = new Array(n);
  const vocab = new Map<string, Posting>();
  for (let i = 0; i < n; i++) {
    const t = fold(String(getText(items[i])));
    texts[i] = t;
    const b = bounds(t);
    words[i] = Int32Array.from(b); // offsets, not substrings: ~2.5x less heap
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
  const vWord: string[] = new Array(size),
    vPost: Posting[] = new Array(size);
  const vMask = new Int32Array(size),
    vLen = new Int32Array(size);
  let k = 0;
  for (const [w, post] of vocab) {
    vWord[k] = w;
    vPost[k] = post;
    vMask[k] = charMask(w);
    vLen[k] = w.length;
    k++;
  }
  const index: Index<Item> = {
    items,
    keys,
    texts,
    words,
    vocab,
    vWord,
    vPost,
    vMask,
    vLen,
    getText,
    _hits: new Int32Array(n),
    _seen: new Int32Array(n),
    _gen: 0,
    _maps: [],
  };
  return index;
}

// --- scoring cascade ------------------------------------------------------
// Tiers never overlap: exact 1000 > prefix 900 > substring 800 > per-word <= 170.
// Runs once per vocabulary word. `tol`, `qMask` and the switches are resolved once per query word
// by the caller and passed as plain arguments, not read off the options object here.
function wordScore(
  q: string,
  qMask: number,
  w: string,
  tol: number,
  prefix: boolean,
  infix: boolean,
  keepInitial: boolean,
): number {
  if (w === q) return 100;
  if (prefix && w.length > q.length && w.startsWith(q)) return 90 - Math.min(9, w.length - q.length);
  const at = infix && q.length >= 3 ? w.indexOf(q) : -1; // no infix match on 1-2 letters:
  if (at > 0) return 70; // "de" must not match "monde"
  if (tol === 0) return 0;
  if (keepInitial && w.charCodeAt(0) !== q.charCodeAt(0)) return 0;
  // The edit distance is taken against the start of `w`, `q.length + tol` letters at most. Each edit
  // brings in at most one letter of `q` that this start lacks and drops at most one it has that `q`
  // lacks: more of either than the budget and osa() cannot accept it. Exact, and it spares osa() most
  // of the words that reach this line, whose letters the whole-word mask sees further along.
  const end = w.length > q.length + tol ? q.length + tol : w.length;
  const m = charMask(w, end);
  if (popcount(qMask & ~m) > tol || popcount(m & ~qMask) > tol) return 0;
  const cut = end < w.length ? w.slice(0, end) : w;
  const d = osa(q, cut, tol);
  return d <= tol ? 62 - 12 * d - (cut === w ? 0 : 4) : 0;
}

// Postings lists of every vocabulary word reachable from `q`, with their score.
//
// Two integer rejects come first, and both are exact — they can only drop words
// wordScore() would have scored 0 anyway:
//   - a word shorter than `q` minus the edit budget cannot be within budget,
//     and cannot contain `q` either;
//   - `q` matches only as an equal string, a prefix, an infix or within `tol`
//     edits, so a letter of `q` that the word does not contain at all costs at
//     least one edit. More than `tol` such letters and the word is out.
// This is what keeps a 46 000-word vocabulary off the hot path.
function vocabHits<Item>(q: string, index: Index<Item>, o: Options = DEFAULTS): { posts: Posting[]; scores: number[] } {
  const { vWord, vPost, vMask, vLen } = index;
  const tol = budget(q, o),
    { prefix, infix, keepInitial } = o;
  const qMask = charMask(q),
    minLen = q.length - tol;
  const posts: Posting[] = [],
    scores: number[] = [];
  for (let k = 0; k < vWord.length; k++) {
    if (vLen[k] < minLen) continue;
    if (popcount(qMask & ~vMask[k]) > tol) continue;
    const s = wordScore(q, qMask, vWord[k], tol, prefix, infix, keepInitial);
    if (s > 0) {
      posts.push(vPost[k]);
      scores.push(s);
    }
  }
  return { posts, scores };
}

// Scratch buffers, one pair per query word, reused across searches.
function scratch<Item>(index: Index<Item>, slots: number, n: number): NonNullable<Index<Item>['_pool']> {
  const pool = index._pool ?? (index._pool = []);
  while (pool.length < slots) pool.push({ score: new Float32Array(n), pos: new Int32Array(n) });
  return pool;
}

// "artdesign" -> ["art", "design"], when the user dropped a space.
function unglue(q: string, vocab: Map<string, Posting>): [string, string] | null {
  for (let k = 3; k <= q.length - 3; k++) {
    const a = q.slice(0, k),
      b = q.slice(k);
    if (vocab.has(a) && vocab.has(b)) return [a, b];
  }
  return null;
}

// Letters and digits in row `i`: what a query has to account for to "cover" it.
function letters<Item>(index: Index<Item>, i: number): number {
  const w = index.words[i];
  let n = 0;
  for (let k = 0; k < w.length; k += 2) n += w[k + 1] - w[k];
  return n || 1;
}

// Normalize + collapse whitespace, shared by search() and ranges(). Non-string
// queries (null, numbers) read as their string form or empty, never throw.
function qNorm(query: unknown): string {
  // oxlint-disable-next-line typescript/no-base-to-string -- on purpose: any value reads as its string form
  return fold(String(query ?? ''))
    .trim()
    .replace(/\s+/g, ' ');
}

// One search result, as both search() and substrScan() return it.
const result = <Item>(index: Index<Item>, i: number, score: number): SearchResult<Item> => ({
  item: index.items[i],
  key: index.keys ? index.keys[i] : i,
  score,
  i,
});

// Fallback for queries the inverted index cannot see at all: a query with no
// ASCII word characters — a non-Latin script (bounds() only knows a-z0-9), or
// a symbol. A substring scan over the normalized texts keeps such queries from
// being a silent miss. No fuzz here; punctuation-only queries stay empty.
function substrScan<Item>(qText: string, index: Index<Item>, limit: number): SearchResult<Item>[] {
  if (!NON_ASCII.test(qText)) return [];
  const out: SearchResult<Item>[] = [];
  for (let i = 0; i < index.texts.length; i++) {
    const text = index.texts[i];
    const at = text.indexOf(qText);
    if (at < 0) continue;
    out.push(result(index, i, text === qText ? 1000 : at === 0 ? 900 : 800 + 1 / (1 + at)));
  }
  out.sort((a, b) => b.score - a.score);
  return limit < out.length ? out.slice(0, limit) : out;
}

/**
 * Fuzzy filter and sort, ordered by descending score.
 *
 * Every query word must land somewhere, which is what keeps precision high: one nonsense word and the row is out.
 *
 * @example
 * ```
 * import {createIndex, search} from 'fzy-search';
 *
 * const index = createIndex(formations, 'name');
 *
 * search('sicences donnes', index, {limit: 20});
 * //=> [{item: {name: 'DEUST Science des données - INSA Lyon'}, key: 0, score: 89.13, i: 0}, …]
 * ```
 */
export function search<Item>(
  query: string,
  fzyIndex: FzyIndex<Item>,
  options: SearchOptions = {},
): SearchResult<Item>[] {
  const index = fzyIndex as Index<Item>;
  const o = { ...DEFAULTS, ...options } as Options;
  const limit = o.limit;
  if (limit <= 0) return [];
  const qText = qNorm(query);
  if (!qText) return [];
  const raw = tokenize(qText);
  if (!raw.length) return substrScan(qText, index, limit);

  // 1. resolve each query word against the vocabulary — once, not per row
  const qWords: string[] = [],
    matches: { posts: Posting[]; scores: number[] }[] = [];
  for (const q of raw) {
    const hit = vocabHits(q, index, o);
    const parts = hit.posts.length ? null : unglue(q, index.vocab);
    for (const w of parts ?? [q]) {
      qWords.push(w);
      matches.push(parts ? vocabHits(w, index, o) : hit);
    }
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
    const bestScore = pool[k].score,
      bestPos = pool[k].pos;
    for (let m = 0; m < posts.length; m++) {
      const post = posts[m],
        s = scores[m];
      for (let p = 0; p < post.length; p += 2) {
        const id = post[p];
        if (seen[id] !== gen) {
          seen[id] = gen;
          if (++hits[id] === need) matched++;
          bestScore[id] = s;
          bestPos[id] = post[p + 1];
        } else if (s > bestScore[id]) {
          bestScore[id] = s;
          bestPos[id] = post[p + 1];
        }
      }
    }
  }
  if (!matched) return [];

  // 3. only rows that satisfy every query word reach the cascade. Note the
  //    first three tiers look at the WHOLE query: any substring hit of the full
  //    query outranks a perfect per-word match (~170 is the word-level ceiling).
  //    With a limit, keep a running top-N instead of sorting every match:
  //    a one-letter-ish query can match 40 000 rows to show ten.
  const out: SearchResult<Item>[] = [];
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
      if (at > 0) score = 800 + 1 / (1 + at); // earlier match ranks higher
      else {
        let total = 0,
          last = -1,
          ordered = true;
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
    const row = result(index, i, score);
    if (!capped) {
      out.push(row);
      continue;
    }
    let j = out.length - 1;
    out.push(row);
    while (j >= 0 && out[j].score < score) {
      out[j + 1] = out[j];
      j--;
    }
    out[j + 1] = row;
    if (out.length > limit) out.pop();
    floor = out[out.length - 1].score;
  }
  if (!capped) out.sort((a, b) => b.score - a.score);
  return out;
}

// --- highlighting ---------------------------------------------------------
/**
 * Matched ranges `[start, end)` in the **original**, un-normalized string of row `i`, merged and sorted.
 *
 * @example
 * ```
 * ranges('sicences donnes', index, hits[0].i);
 * //=> [[6, 13], [18, 25]]
 * ```
 */
export function ranges<Item>(query: string, fzyIndex: FzyIndex<Item>, i: number): [start: number, end: number][] {
  const index = fzyIndex as Index<Item>;
  const src = index.getText(index.items[i]);
  // The normalize map is cached per row, lazily: only rows that ever get
  // highlighted pay for it, so the index keeps its memory profile.
  const norm = index._maps[i] ?? (index._maps[i] = normalize(src));
  const { text, map } = norm;
  const qText = qNorm(query);
  const spans: [number, number][] = [];
  const push = (s: number, e: number) => spans.push([map[s], (map[e - 1] ?? map.length - 1) + 1]);
  const at = text.indexOf(qText);
  if (at >= 0) push(at, at + qText.length);
  else {
    const b = bounds(text);
    for (const q of tokenize(qText)) {
      const qMask = charMask(q);
      let best = 0,
        span: [number, number] | null = null;
      for (let bi = 0; bi < b.length; bi += 2) {
        const off = b[bi],
          w = text.slice(off, b[bi + 1]);
        const s = wordScore(q, qMask, w, tolerance(q.length), true, true, false);
        if (s > best) {
          best = s;
          const k = w.indexOf(q);
          span = k > 0 ? [off + k, off + k + q.length] : [off, off + Math.min(w.length, q.length + 2)];
        }
      }
      if (span) push(span[0], span[1]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const prev = merged[merged.length - 1];
    if (prev && s[0] <= prev[1]) prev[1] = Math.max(prev[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/**
 * The original string of row `i` with the matches wrapped in `tag`. Everything outside the tags is HTML-escaped.
 *
 * @param tag - The element to wrap each match in.
 *
 * @example
 * ```
 * highlight('sicences donnes', index, hits[0].i);
 * //=> 'DEUST <mark>Science</mark> des <mark>données</mark> - INSA Lyon'
 * ```
 */
export function highlight<Item>(query: string, fzyIndex: FzyIndex<Item>, i: number, tag = 'mark'): string {
  const src = fzyIndex.getText(fzyIndex.items[i]);
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]);
  let html = '',
    at = 0;
  for (const [s, e] of ranges(query, fzyIndex, i)) {
    html += esc(src.slice(at, s)) + `<${tag}>` + esc(src.slice(s, e)) + `</${tag}>`;
    at = e;
  }
  return html + esc(src.slice(at));
}
