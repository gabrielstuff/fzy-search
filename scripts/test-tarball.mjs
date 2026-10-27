// Tests what would be published: packs the package, installs the tarball in an empty project, and
// uses it the way a consumer does. A file missing from `files`, a broken `exports` map or a type
// declaration that did not ship fails here, where the repository checkout would hide it.
//
//   node scripts/test-tarball.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const work = mkdtempSync(join(tmpdir(), 'fzy-tarball-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], root))[0];
  const tarball = join(work, packed.filename);
  console.log(`packed ${packed.filename}: ${packed.files.map((f) => f.path).join(', ')}`);

  const project = join(work, 'project');
  run('mkdir', ['-p', project], work);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], project);

  const installed = join(project, 'node_modules', 'fzy-search');
  for (const file of ['index.js', 'index.d.ts']) {
    if (!existsSync(join(installed, file))) throw new Error(`${file} is missing from the published package`);
  }
  const extra = readdirSync(installed).filter((f) => !['index.js', 'index.d.ts', 'package.json', 'license', 'readme.md', 'llms.txt', 'skills', 'CHANGELOG.md'].includes(f));
  if (extra.length) throw new Error(`unexpected files in the published package: ${extra.join(', ')}`);

  // The package under test is the installed copy, imported by its name.
  writeFileSync(join(project, 'check.mjs'), `
    import assert from 'node:assert';
    import * as fzy from 'fzy-search';
    const expected = ${JSON.stringify(Object.keys(await import(join(root, 'index.js'))).sort())};
    assert.deepStrictEqual(Object.keys(fzy).sort(), expected, 'the installed package exports what the checkout exports');
    const index = fzy.createIndex(['Master Sciences', 'CAP Pâtisserie']);
    assert.strictEqual(fzy.search('patisserie', index)[0].item, 'CAP Pâtisserie');
    assert.ok(fzy.highlight('patisserie', index, 1).includes('<mark>'));
    console.log('tarball ok: ' + expected.join(', '));
  `);
  console.log(run('node', ['check.mjs'], project));
} finally {
  rmSync(work, { recursive: true, force: true });
}
