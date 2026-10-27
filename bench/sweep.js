// The full sweep: every corpus, every metric, each script in its own process, gathered into
// bench/sweep-<label>.json and rendered to results-<label>.md at the repository root. One file per
// machine, so a laptop run and a CI run sit side by side.
//
//   node bench/sweep.js --label mbp                      # about an hour; Fuse.js is most of it
//   node bench/sweep.js --corpora synthetic --skip Fuse  # a quick one
//
// The label defaults to the core count, "4vCPU". Rerender a sweep without rerunning it with
// `node bench/report.js bench/sweep-<label>.json`.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { render } from './report.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const label = opt('label', `${os.cpus().length}vCPU`);
if (!/^[\w.-]+$/.test(label)) throw new Error(`--label: letters, digits, dot, dash and underscore only, got "${label}"`);
const corpora = opt('corpora', 'synthetic,alpaca,abo,overture').split(',').filter(Boolean);
process.env.SKIP = opt('skip', process.env.SKIP ?? '');
const { adapters } = await import('./adapters.js'); // after SKIP is set: the filter is read at load

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const root = here('../');
const json = (p) => JSON.parse(readFileSync(here(p), 'utf8'));
const node = (script, args = [], capture = false) => {
  const r = spawnSync(process.execPath, ['--expose-gc', here(script), ...args], {
    cwd: root,
    stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`bench/${script} ${args.join(' ')} exited with ${r.status}`);
  return r.stdout;
};

const machine = {
  label,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  cores: os.cpus().length,
  memoryGb: Math.round(os.totalmem() / 2 ** 30),
  os: `${os.type()} ${os.release()} ${os.arch()}`,
  node: process.version,
  date: new Date().toISOString().slice(0, 10),
  commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  lib: process.env.FZY_LIB ?? 'packages/fzy-search/dist',
};
const versions = Object.fromEntries(
  [
    ['fzy-search', '../packages/fzy-search/package.json'],
    ...['match-sorter', 'fuzzysort', 'fuse.js', 'minisearch', 'flexsearch'].map((n) => [n, `./node_modules/${n}/package.json`]),
  ].map(([n, p]) => [n, json(p).version]),
);
const contenders = adapters().map((a) => a.name);
console.log(`sweep "${label}": ${machine.cpu} × ${machine.cores}, ${machine.node}, ${corpora.join(' ')}, ${contenders.length} libraries`);

const sweep = { machine, versions, contenders, size: null, corpora: {}, scaling: null };
node('size.js');
sweep.size = json('./size.json');
for (const c of corpora) {
  console.log(`\n################ ${c}`);
  node('run.js', [c]);
  node('noise.js', [c]);
  const f = c.replace(/\W/g, '_');
  const mem = [];
  for (let i = 0; i < contenders.length; i++) {
    const line = node('mem.js', [String(i), c], true).trim().split('\n').pop();
    if (line) mem.push(JSON.parse(line));
  }
  sweep.corpora[c] = { ...json(`./results-${f}.json`), noise: json(`./noise-${f}.json`), mem };
}
node('scaling.js');
sweep.scaling = json('./scaling.json');

writeFileSync(here(`./sweep-${label}.json`), JSON.stringify(sweep, null, 2));
const out = `${root}results-${label}.md`;
writeFileSync(out, render(sweep));
console.log(`\nwrote results-${label}.md and bench/sweep-${label}.json`);
