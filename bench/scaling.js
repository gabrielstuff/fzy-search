// fzy resolves each query word against the vocabulary, so its cost grows with the
// number of DISTINCT words, not with the number of rows. This measures that.
import { createIndex, search } from './lib.js';
import { writeFileSync } from 'node:fs';

const S1 = ['ma', 'in', 'tra', 'pro', 'sci', 'com', 'ges', 'don', 'ele', 'bio', 'geo', 'psy', 'lit', 'phy', 'chi', 'eco'];
const S2 = ['nage', 'forma', 'duc', 'lo', 'tec', 'mer', 'tion', 'nee', 'ctri', 'logi', 'graphi', 'cholo', 'tera', 'sique', 'mie', 'nomi'];
const S3 = ['ment', 'tique', 'ation', 'gie', 'ique', 'elle', 'aire', 'isme', 'ance', 'ure', 'ien', 'eur'];

function words(n, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = new Set();
  for (let i = 0; out.size < n; i++) {
    const base = S1[(rnd() * S1.length) | 0] + S2[(rnd() * S2.length) | 0] + S3[(rnd() * S3.length) | 0];
    out.add(out.has(base) ? base + i.toString(36) : base);   // suffix only on collision
  }
  return [...out];
}

const out = [];
console.log('rows'.padStart(8) + 'vocab'.padStart(9) + 'build ms'.padStart(10) + 'p50 ms'.padStart(9) + 'p95 ms'.padStart(9));
console.log('-'.repeat(45));
for (const [rows, vocabSize] of [[20000, 500], [20000, 5000], [20000, 50000], [100000, 5000], [100000, 50000]]) {
  process.stderr.write(`  building ${rows}x${vocabSize}...
`);
  const vocab = words(vocabSize);
  const items = [];
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < rows; i++) {
    const n = [];
    for (let k = 0; k < 9; k++) n.push(vocab[(rnd() * vocab.length) | 0]);
    items.push({ id: i, name: n.join(' ') });
  }
  const t0 = performance.now();
  const idx = createIndex(items, (x) => x.name);
  const build = performance.now() - t0;

  const qs = [];
  for (let i = 0; i < 200; i++) {
    const a = vocab[(rnd() * vocab.length) | 0], b = vocab[(rnd() * vocab.length) | 0];
    qs.push(a.slice(0, a.length - 1) + ' ' + b);          // one deletion typo
  }
  for (const q of qs.slice(0, 30)) search(q, idx, { limit: 10 });
  const per = qs.map((q) => { const t = performance.now(); search(q, idx, { limit: 10 }); return performance.now() - t; }).sort((a, b) => a - b);
  const row = { rows, vocab: idx.vocab.size, buildMs: build, p50: per[per.length >> 1], p95: per[Math.floor(per.length * 0.95)] };
  out.push(row);
  console.log(String(rows).padStart(8) + String(row.vocab).padStart(9) + build.toFixed(0).padStart(10)
    + row.p50.toFixed(2).padStart(9) + row.p95.toFixed(2).padStart(9));
}
writeFileSync(new URL('./scaling.json', import.meta.url), JSON.stringify(out, null, 2));
