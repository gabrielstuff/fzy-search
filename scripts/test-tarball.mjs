// Tests what would be published, on every runtime the readme promises: packs packages/fzy-search,
// installs the tarball in an empty project, and imports it by name from Node, Bun and Deno. A file
// missing from `files`, a broken `exports` map or a declaration that did not ship fails here, where
// the repository checkout would hide it.
//
//   vp run fzy-search#tarball                      builds first, then checks on Node
//   node scripts/test-tarball.mjs --runtimes node,bun,deno   what CI runs; a missing runtime fails
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = fileURLToPath(new URL('../packages/fzy-search', import.meta.url));
const flag = process.argv.indexOf('--runtimes');
const runtimes = flag === -1 ? ['node'] : process.argv[flag + 1].split(',');
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

// The exports the source declares, read from src/index.ts: an independent account of what the
// built package must expose.
const source = readFileSync(join(pkg, 'src/index.ts'), 'utf8');
const expected = [...new Set([...source.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]))].sort();
if (!existsSync(join(pkg, 'dist/index.js'))) throw new Error('dist/ is empty: run `vp run fzy-search#build` first.');

const SHIPPED = ['CHANGELOG.md', 'README.md', 'dist', 'license', 'llms.txt', 'package.json', 'skills'];
const work = mkdtempSync(join(tmpdir(), 'fzy-tarball-'));
try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], pkg))[0];
  console.log(`packed ${packed.filename}: ${packed.files.map((f) => f.path).join(', ')}`);

  const project = join(work, 'project');
  mkdirSync(project);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(work, packed.filename)], project);

  const installed = join(project, 'node_modules', 'fzy-search');
  for (const file of ['dist/index.js', 'dist/index.d.ts', 'README.md', 'license'])
    if (!existsSync(join(installed, file))) throw new Error(`${file} is missing from the published package`);
  const extra = readdirSync(installed).filter((f) => !SHIPPED.includes(f));
  if (extra.length) throw new Error(`unexpected files in the published package: ${extra.join(', ')}`);

  // The package under test is the installed copy, imported by its name, as a consumer would.
  writeFileSync(
    join(project, 'check.mjs'),
    `import assert from 'node:assert';
import * as fzy from 'fzy-search';
const runtime = globalThis.Deno ? 'deno ' + Deno.version.deno : globalThis.Bun ? 'bun ' + Bun.version : 'node ' + process.version;
assert.deepStrictEqual(Object.keys(fzy).sort(), ${JSON.stringify(expected)}, 'the installed package exports what the source declares');
const index = fzy.createIndex(['Master Sciences', 'CAP Pâtisserie', 'Doctorat Informatique option Cloud']);
assert.strictEqual(fzy.search('patisserie', index)[0].item, 'CAP Pâtisserie');
assert.strictEqual(fzy.search('doct info cloud', index, { limit: 1 })[0].item, 'Doctorat Informatique option Cloud');
assert.strictEqual(fzy.highlight('patisserie', index, 1), 'CAP <mark>Pâtisserie</mark>');
console.log('tarball ok on ' + runtime);
`,
  );
  const commands = {
    node: ['node', ['check.mjs']],
    bun: ['bun', ['check.mjs']],
    deno: ['deno', ['run', '--allow-read', 'check.mjs']],
  };
  for (const name of runtimes) {
    if (!commands[name]) throw new Error(`unknown runtime ${name}: use node, bun or deno`);
    console.log(run(...commands[name], project));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
