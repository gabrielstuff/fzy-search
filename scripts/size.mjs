// Bundle cost of what a consumer imports, minified + gzipped, with the same esbuild options as bench/size.js.
//
//   node scripts/size.mjs            fails if the cost is over the budget (CI runs this)
//   node scripts/size.mjs <file.js>  measures another copy of the library, e.g. to compare with a release
//
// The readme and package.json quote these numbers: change the budget on purpose, in the PR that
// grows the library, and update the quoted figures with it.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Bytes, gzipped, for `createIndex` + `search`. 1 kB = 1024 B, as in the readme. */
const BUDGET_SEARCH_ONLY = 2800;
/** The same plus `highlight`. */
const BUDGET_WITH_HIGHLIGHT = 3200;

const target = resolve(process.argv[2] ?? fileURLToPath(new URL('../index.js', import.meta.url)));

async function gzipSize(names) {
  const out = await build({
    stdin: { contents: `export { ${names} } from ${JSON.stringify(target)}`, resolveDir: process.cwd(), loader: 'js' },
    bundle: true, minify: true, format: 'esm', platform: 'browser', write: false, legalComments: 'none', target: 'es2020',
  });
  return gzipSync(Buffer.from(out.outputFiles[0].contents), { level: 9 }).length;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} kB`;
const searchOnly = await gzipSize('createIndex, search');
const withHighlight = await gzipSize('createIndex, search, highlight');
console.log(`createIndex + search  ${String(searchOnly).padStart(5)} B  ${kb(searchOnly)}  (budget ${kb(BUDGET_SEARCH_ONLY)})`);
console.log(`+ highlight           ${String(withHighlight).padStart(5)} B  ${kb(withHighlight)}  (budget ${kb(BUDGET_WITH_HIGHLIGHT)})`);

if (process.argv[2]) process.exit(0);
if (searchOnly > BUDGET_SEARCH_ONLY || withHighlight > BUDGET_WITH_HIGHLIGHT) {
  console.error('Over budget. If the growth is intended, raise the budget here and update the sizes in readme.md and package.json.');
  process.exit(1);
}
