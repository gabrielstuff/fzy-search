// Renders the pull-request size comment from `{head, base}`, each `{searchOnly, withHighlight}` in bytes.
//
//   node scripts/size-comment.mjs size.json > comment.md
//
// The file comes from a job that ran the pull request's code, so it is data, not instructions: every
// number is checked to be a plain integer before it is written into markdown, and nothing else is read.
import { readFileSync } from 'node:fs';

export const MARKER = '<!-- fzy-size -->';

const size = (value) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1e6) throw new Error(`not a size in bytes: ${JSON.stringify(value)}`);
  return value;
};
const kb = (bytes) => `${(bytes / 1024).toFixed(2)} kB`;
const delta = (head, base) => {
  const d = head - base;
  return d === 0 ? 'no change' : `${d > 0 ? '+' : '−'}${Math.abs(d)} B`;
};

export function render({ head, base }) {
  const rows = [
    ['createIndex + search', size(head.searchOnly), size(base.searchOnly)],
    ['+ highlight', size(head.withHighlight), size(base.withHighlight)],
  ];
  const lines = rows.map(([name, h, b]) => `| ${name} | ${kb(b)} | ${kb(h)} | ${delta(h, b)} |`);
  return [
    MARKER,
    '### Bundle size',
    '',
    'Minified and gzipped, as a consumer imports it: this pull request against its base.',
    '',
    '| | base | this PR | delta |',
    '| --- | --- | --- | --- |',
    ...lines,
    '',
  ].join('\n');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { head, base } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(render({ head, base }));
}
