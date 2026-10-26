// Fails when a documented surface forgets part of the API: every option of `SearchOptions` and every
// export in index.d.ts must appear in the agent skill, llms.txt and the readme. The types are the
// source of truth; the prose around them is what drifts.
//
//   node scripts/check-docs.mjs
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const types = read('index.d.ts');

const optionsBlock = types.match(/export type SearchOptions = \{([\s\S]*?)\n\};/)?.[1] ?? '';
const options = [...optionsBlock.matchAll(/^\treadonly (\w+)\?:/gm)].map((m) => m[1]);
const exports = [...types.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
if (options.length === 0 || exports.length === 0) {
  console.error('Could not read the options or the exports out of index.d.ts: update scripts/check-docs.mjs.');
  process.exit(1);
}

const surfaces = { 'skills/fzy-search/SKILL.md': [...options, 'createIndex', 'search', 'highlight'], 'llms.txt': [...options, ...exports.filter((n) => !['normalize', 'osa'].includes(n))], 'readme.md': [...options, ...exports] };
let failed = false;
for (const [file, names] of Object.entries(surfaces)) {
  const text = read(file);
  for (const name of names) {
    if (!new RegExp(`\\b${name}\\b`).test(text)) {
      console.error(`${file} never mentions \`${name}\`, which index.d.ts exports.`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`docs cover ${options.length} options and ${exports.length} exports in ${Object.keys(surfaces).length} places`);
