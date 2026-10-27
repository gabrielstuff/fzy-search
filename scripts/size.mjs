// Bundle cost of what a consumer imports from the built package (packages/fzy-search/dist), minified
// and gzipped with the same esbuild options as bench/size.js, so it compares with the contenders there.
//
//   vp run fzy-search#size           builds first, then fails if the cost is over the budget (CI runs this)
//   node scripts/size.mjs            the same, on whatever dist/ holds
//   node scripts/size.mjs <file.js>  measures another copy of the library, e.g. to compare with a release
//   node scripts/size.mjs --json     prints the two sizes as JSON and checks nothing (the size comment uses it)
//
// The package readme, package.json and llms.txt quote these numbers: change the budget on purpose, in the PR that
// grows the library, and update the quoted figures with it.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Bytes, gzipped, for `createIndex` + `search`. 1 kB = 1024 B, as in the readme. */
const BUDGET_SEARCH_ONLY = 2800;
/** The same plus `highlight`. */
const BUDGET_WITH_HIGHLIGHT = 3200;

const args = process.argv.slice(2);
const json = args.includes('--json');
const file = args.find((arg) => !arg.startsWith('--'));
const target = resolve(file ?? fileURLToPath(new URL('../packages/fzy-search/dist/index.js', import.meta.url)));

async function gzipSize(names) {
  const out = await build({
    stdin: { contents: `export { ${names} } from ${JSON.stringify(target)}`, resolveDir: process.cwd(), loader: 'js' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    legalComments: 'none',
    target: 'es2020',
  });
  return gzipSync(Buffer.from(out.outputFiles[0].contents), { level: 9 }).length;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} kB`;
const searchOnly = await gzipSize('createIndex, search');
const withHighlight = await gzipSize('createIndex, search, highlight');
if (json) {
  console.log(JSON.stringify({ searchOnly, withHighlight }));
  process.exit(0);
}
console.log(
  `createIndex + search  ${String(searchOnly).padStart(5)} B  ${kb(searchOnly)}  (budget ${kb(BUDGET_SEARCH_ONLY)})`,
);
console.log(
  `+ highlight           ${String(withHighlight).padStart(5)} B  ${kb(withHighlight)}  (budget ${kb(BUDGET_WITH_HIGHLIGHT)})`,
);

if (file) process.exit(0);
let failed = false;
if (searchOnly > BUDGET_SEARCH_ONLY || withHighlight > BUDGET_WITH_HIGHLIGHT) {
  console.error(
    'Over budget. If the growth is intended, raise the budget here and update the sizes in packages/fzy-search: README.md, package.json and llms.txt.',
  );
  failed = true;
}

// The quoted figures are the measured ones, rounded to 0.1 kB: a stale claim fails like a blown budget.
const quoted = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const claims = [
  ['packages/fzy-search/package.json', `${quoted(searchOnly)},`],
  ['packages/fzy-search/llms.txt', `about ${quoted(searchOnly)} gzipped`],
  ['packages/fzy-search/README.md', `${quoted(searchOnly)} gzipped`],
  ['packages/fzy-search/README.md', `(${quoted(withHighlight)} if you also pull in`],
  ['packages/fzy-search/README.md', `**${quoted(searchOnly)}**`],
  ['README.md', `${quoted(searchOnly)} gzipped`],
];
for (const [file, text] of claims) {
  if (!read(file).includes(text)) {
    console.error(
      `${file} does not say "${text}": the measured size changed, or the claim did. Update the quoted figure.`,
    );
    failed = true;
  }
}
if (failed) process.exit(1);
