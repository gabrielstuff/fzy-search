// node --expose-gc bench/run.js [corpusSize]
import { getCorpus, keyOf } from './corpora.js';
import { buildQueries, CATEGORIES } from './queries.js';
import { adapters } from './adapters.js';

// node --expose-gc bench/run.js [synthetic|synthetic:50000|abo|overture]
const NAME = process.argv[2] || 'synthetic';
const LIMIT = 10;
const REPEATS = 2;

const corpus = await getCorpus(NAME);
const ADAPTERS = adapters(keyOf(NAME));
const queries = buildQueries(corpus, { perCategory: Number(process.env.PER_CATEGORY || 40), key: keyOf(NAME) });
console.log(`${NAME}: ${corpus.length} rows · ${queries.length} labeled queries · limit ${LIMIT}\n`);

const gc = () => { if (global.gc) { global.gc(); global.gc(); } };
const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const quantile = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const rows = [];
const ONLY = process.env.ONLY;
for (const a of ADAPTERS.filter((x) => !ONLY || x.name.includes(ONLY))) {
  // ---- index build: time + retained heap -------------------------------
  const builds = [];
  let handle;
  for (let r = 0; r < REPEATS; r++) {
    gc();
    const t = performance.now();
    handle = a.build(corpus);
    builds.push(performance.now() - t);
  }
  // ---- warmup ----------------------------------------------------------
  for (const { q } of queries.slice(0, 50)) a.search(handle, q, LIMIT);

  // ---- speed -----------------------------------------------------------
  const per = [], results = [];
  for (let r = 0; r < REPEATS; r++) {
    for (let i = 0; i < queries.length; i++) {
      const t = performance.now();
      const ids = a.search(handle, queries[i].q, LIMIT);
      const d = performance.now() - t;
      if (r === 0) { per.push(d); results.push(ids); } else per[i] = Math.min(per[i], d);
    }
  }

  // ---- quality ---------------------------------------------------------
  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, { n: 0, top1: 0 }]));
  let top1 = 0, mrr = 0, recall = 0;
  for (let i = 0; i < queries.length; i++) {
    const { expected, category } = queries[i];
    const rank = results[i].indexOf(expected);
    byCat[category].n++;
    if (rank === 0) { top1++; byCat[category].top1++; }
    if (rank >= 0) { mrr += 1 / (rank + 1); recall++; }
  }
  const n = queries.length;
  rows.push({
    name: a.name,
    buildMs: median(builds),
    p50: quantile(per, 0.5), p95: quantile(per, 0.95), max: Math.max(...per),
    top1: (100 * top1) / n, mrr: mrr / n, recall: (100 * recall) / n,
    byCat: Object.fromEntries(CATEGORIES.map((c) => [c, (100 * byCat[c].top1) / (byCat[c].n || 1)])),
  });
  process.stdout.write(`✓ ${a.name}\n`);
}

// ---- report ------------------------------------------------------------
import { writeFileSync } from 'node:fs';
writeFileSync(new URL(`./results-${NAME.replace(/\W/g, '_')}.json`, import.meta.url), JSON.stringify({ corpus: NAME, rows: corpus.length, queries: queries.length, results: rows }, null, 2));
const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 2, n = 8) => v.toFixed(d).padStart(n);

console.log(`\n## Speed & footprint — ${NAME}, ${corpus.length} rows\n`);
console.log(pad('library', 26) + ['build ms', 'p50 ms', 'p95 ms', 'max ms'].map((h, i) => h.padStart(i ? 9 : 10)).join(''));   // heap: see bench/mem.js
console.log('-'.repeat(72));
for (const r of rows) console.log(pad(r.name, 26) + num(r.buildMs, 1, 10) + num(r.p50, 3, 9) + num(r.p95, 3, 9) + num(r.max, 2, 9));

console.log(`\n## Relevance (${queries.length} queries, one correct answer each)\n`);
console.log(pad('library', 26) + 'top-1 %'.padStart(10) + 'MRR@10'.padStart(9) + 'recall@10 %'.padStart(13));
console.log('-'.repeat(58));
for (const r of rows) console.log(pad(r.name, 26) + num(r.top1, 1, 10) + num(r.mrr, 3, 9) + num(r.recall, 1, 13));

console.log(`\n## Typo robustness — top-1 % per query shape\n`);
console.log(pad('library', 26) + CATEGORIES.map((c) => c.slice(0, 6).padStart(8)).join(''));
console.log('-'.repeat(26 + 8 * CATEGORIES.length));
for (const r of rows) console.log(pad(r.name, 26) + CATEGORIES.map((c) => r.byCat[c].toFixed(0).padStart(8)).join(''));

console.log('\nSample queries:');
for (const c of CATEGORIES) {
  const s = queries.find((x) => x.category === c);
  console.log(`  ${pad(c, 14)} "${s.q}"  ->  ${corpus[s.expected][keyOf(NAME)]}`);
}
