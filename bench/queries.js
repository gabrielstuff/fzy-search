// Labeled query set: each query has exactly one correct answer in the corpus.
// Built by picking a word window that is UNIQUE in the corpus, then perturbing it.

const norm = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
   .replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOP = new Set(['de', 'la', 'le', 'les', 'du', 'des', 'et', 'en', 'a', 'l', 'd', 'ses', 'au']);

// ---- perturbations -------------------------------------------------------
const pickWord = (words, rnd) => {
  const cand = words.map((w, i) => [w, i]).filter(([w]) => w.length >= 6 && !STOP.has(w));
  return cand.length ? cand[(rnd() * cand.length) | 0] : null;
};

const PERTURB = {
  exact: (words) => words.join(' '),

  transposition: (words, rnd) => {
    const p = pickWord(words, rnd); if (!p) return null;
    const [w, i] = p;
    const k = 1 + ((rnd() * (w.length - 2)) | 0);
    const out = words.slice();
    out[i] = w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2);
    return out.join(' ');
  },

  deletion: (words, rnd) => {
    const p = pickWord(words, rnd); if (!p) return null;
    const [w, i] = p;
    const k = 1 + ((rnd() * (w.length - 1)) | 0);
    const out = words.slice();
    out[i] = w.slice(0, k) + w.slice(k + 1);
    return out.join(' ');
  },

  substitution: (words, rnd) => {
    const NEIGHBOR = { a: 'q', e: 'r', i: 'o', o: 'i', u: 'y', n: 'm', m: 'n', s: 'd', t: 'r', c: 'v', l: 'k', r: 't' };
    const p = pickWord(words, rnd); if (!p) return null;
    const [w, i] = p;
    for (let tries = 0; tries < 8; tries++) {
      const k = 1 + ((rnd() * (w.length - 1)) | 0);
      const rep = NEIGHBOR[w[k]];
      if (!rep) continue;
      const out = words.slice();
      out[i] = w.slice(0, k) + rep + w.slice(k + 1);
      return out.join(' ');
    }
    return null;
  },

  reorder: (words, rnd) => {
    if (words.length < 3) return null;
    const out = words.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.join(' ') === words.join(' ') ? null : out.join(' ');
  },

  // user types only part of the label: one interior word is missing
  partial: (words, rnd) => {
    if (words.length < 4) return null;
    const drop = 1 + ((rnd() * (words.length - 2)) | 0);
    const out = words.filter((_, i) => i !== drop);
    return out.length >= 3 ? out.join(' ') : null;
  },

  prefix: (words, rnd) => {
    const keep = words.filter((w) => !STOP.has(w) && w.length >= 5).slice(0, 3);
    if (keep.length < 2) return null;
    return keep.map((w) => w.slice(0, 4 + ((rnd() * 2) | 0))).join(' ');
  },

  // missing space between two words: "sciencesdonnees"
  glued: (words, rnd) => {
    if (words.length < 3) return null;
    const i = (rnd() * (words.length - 1)) | 0;
    const out = words.slice();
    out.splice(i, 2, words[i] + words[i + 1]);
    return out.join(' ');
  },
};

export const CATEGORIES = Object.keys(PERTURB);

export function buildQueries(corpus, { perCategory = 60, seed = 7, key = 'name' } = {}) {
  const rnd = mulberry32(seed);
  const normed = corpus.map((it) => norm(it[key]));

  // --- inverted index, used to guarantee each query resolves to ONE item ----
  const wordToIds = new Map();
  const vocab = [];
  for (let i = 0; i < normed.length; i++) {
    for (const w of new Set(normed[i].split(' '))) {
      let set = wordToIds.get(w);
      if (!set) { set = new Set(); wordToIds.set(w, set); vocab.push(w); }
      set.add(i);
    }
  }
  const prefixCache = new Map();
  const idsForPrefix = (p) => {
    if (prefixCache.has(p)) return prefixCache.get(p);
    const r = computePrefix(p); prefixCache.set(p, r); return r;
  };
  const computePrefix = (p) => {
    const exact = wordToIds.get(p);
    if (exact && p.length >= 5) return exact;
    const out = new Set();
    for (const w of vocab) if (w.startsWith(p)) for (const id of wordToIds.get(w)) out.add(id);
    return out;
  };
  // does this bag of words identify exactly one item?
  const resolvesTo = (words, prefixMode) => {
    let acc = null;
    for (const w of words) {
      const set = prefixMode ? idsForPrefix(w) : (wordToIds.get(w) || new Set());
      if (set.size === 0) return -1;
      if (acc === null) acc = new Set(set);
      else { for (const id of acc) if (!set.has(id)) acc.delete(id); }
      if (acc.size === 0) return -1;
    }
    return acc && acc.size === 1 ? [...acc][0] : -1;
  };

  // candidate word-windows that are unique as a bag of words
  const windows = new Map();
  for (let i = 0; i < normed.length; i++) {
    const w = normed[i].split(' ');
    for (let n = 3; n <= 4; n++) {
      for (let s = 0; s + n <= w.length; s++) {
        const key = w.slice(s, s + n).join(' ');
        if (key.length < 14) continue;
        const cur = windows.get(key);
        if (cur === undefined) windows.set(key, i);
        else if (cur !== i) windows.set(key, -1);
      }
    }
  }
  const unique = [];
  for (const [k, v] of windows) if (v !== -1) unique.push([k, v]);
  unique.sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const queries = [];
  for (const cat of CATEGORIES) {
    let n = 0, guard = 0;
    while (n < perCategory && guard++ < perCategory * 400) {
      const [win, id] = unique[(rnd() * unique.length) | 0];
      const words = win.split(' ');
      if (resolvesTo(words, false) !== id) continue;
      const q = PERTURB[cat](words, rnd);
      if (!q || q.length < 8) continue;
      // the perturbation must not have destroyed the item's identity
      const kept = cat === 'glued' ? words : q.split(' ');
      const prefixMode = cat === 'prefix';
      const check = cat === 'transposition' || cat === 'deletion' || cat === 'substitution' || cat === 'glued'
        ? id                                   // same information, only chars mangled
        : resolvesTo(kept, prefixMode);
      if (check !== id) continue;
      queries.push({ q, expected: id, category: cat });
      n++;
    }
  }
  return queries;
}
