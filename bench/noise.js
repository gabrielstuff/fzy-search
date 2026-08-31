// Counterweight to recall: how often does a library invent a match?
// 120 queries pairing two real corpus words that never appear in the same row.
// Any result is a row that matched only half the query. Lower is better.
import { getCorpus, keyOf } from './corpora.js';
import { adapters } from './adapters.js';
import { createIndex } from '../index.js';
import { writeFileSync } from 'node:fs';

const NAME = process.argv[2] || 'synthetic';
const corpus = await getCorpus(NAME);
const ADAPTERS = adapters(keyOf(NAME));
const index = createIndex(corpus, keyOf(NAME));

function mulberry32(seed) {
  return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(11);

// Pairs of REAL words from the corpus that never occur in the same row.
// Gibberish would be a soft test — every engine rejects it. This is the honest
// one: both words exist, so a matcher that does not require ALL query words to
// land will happily return rows that contain only one of them.
const rows = new Map();                     // word -> Set(row ids)
for (const [w, post] of index.vocab) {
  if (w.length < 5) continue;
  const set = new Set();
  for (let p = 0; p < post.length; p += 2) set.add(post[p]);
  if (set.size >= 3 && set.size <= 2000) rows.set(w, set);
}
const pool = [...rows.keys()];
const disjoint = (a, b) => {
  const [s1, s2] = rows.get(a).size < rows.get(b).size ? [rows.get(a), rows.get(b)] : [rows.get(b), rows.get(a)];
  for (const id of s1) if (s2.has(id)) return false;
  return true;
};

const queries = [];
const seen = new Set();
let guard = 0;
while (queries.length < 120 && guard++ < 200000) {
  const a = pool[(rnd() * pool.length) | 0], b = pool[(rnd() * pool.length) | 0];
  const k = a < b ? `${a} ${b}` : `${b} ${a}`;
  if (a === b || seen.has(k) || !disjoint(a, b)) continue;
  seen.add(k);
  queries.push(`${a} ${b}`);
}

console.log(`${NAME}: ${queries.length} queries with no correct answer · ${corpus.length} rows\n`);
console.log('library'.padEnd(26) + 'returned something %'.padStart(22) + 'avg results'.padStart(14));
console.log('-'.repeat(62));
const out = [];
for (const a of ADAPTERS) {
  process.stderr.write(`  ${a.name}...\n`);
  const h = a.build(corpus);
  let nonEmpty = 0, total = 0;
  for (const q of queries) { const r = a.search(h, q, 10); if (r.length) nonEmpty++; total += r.length; }
  const row = { name: a.name, falsePositiveRate: (100 * nonEmpty) / queries.length, avgResults: total / queries.length };
  out.push(row);
  console.log(a.name.padEnd(26) + row.falsePositiveRate.toFixed(1).padStart(22) + row.avgResults.toFixed(2).padStart(14));
}
writeFileSync(new URL(`./noise-${NAME.replace(/\W/g, '_')}.json`, import.meta.url), JSON.stringify(out, null, 2));
