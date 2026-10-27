// Bundle each library alone, minified + gzipped — what it actually adds to a client bundle.
import { build } from 'esbuild';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';

import { join } from 'node:path';
import { adapters } from './adapters.js';
const ADAPTERS = adapters();

const dir = mkdtempSync(join(import.meta.dirname, '.size-'));
const rows = [];
for (const a of ADAPTERS) {
  if (rows.some((r) => r.name.split(' (')[0] === a.name.split(' (')[0])) continue;
  const file = join(dir, `${a.name.replace(/\W+/g, '_')}.js`);
  writeFileSync(file, a.entry);
  const out = await build({
    entryPoints: [file], bundle: true, minify: true, format: 'esm',
    platform: 'browser', write: false, legalComments: 'none', target: 'es2020',
  });
  const code = Buffer.from(out.outputFiles[0].contents);
  rows.push({ name: a.name.split(' (')[0], min: code.length, gzip: gzipSync(code, { level: 9 }).length, br: brotliCompressSync(code).length });
}
rmSync(dir, { recursive: true });
rows.sort((x, y) => x.gzip - y.gzip);
writeFileSync(new URL('./size.json', import.meta.url), JSON.stringify(rows, null, 2));
console.log('\n## Bundle cost (minified, gzip, brotli)\n');
console.log('library'.padEnd(16) + 'min'.padStart(10) + 'gzip'.padStart(10) + 'brotli'.padStart(10));
console.log('-'.repeat(46));
const kb = (n) => (n / 1024).toFixed(1) + ' kB';
for (const r of rows) {
  console.log(r.name.padEnd(16) + kb(r.min).padStart(10) + kb(r.gzip).padStart(10) + kb(r.br).padStart(10));
}
