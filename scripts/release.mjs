// One-click release of packages/fzy-search: version from the commits, changelog, commit, tag,
// build, test, publish, push.
//
//   pnpm release                       everything, from a clean, up-to-date main (needs `npm login`)
//   node scripts/release.mjs notes     the next version and its notes for this checkout; changes nothing
//   node scripts/release.mjs prepare   bump, changelog, commit, tag: nothing leaves this machine
//   node scripts/release.mjs push      move main and the tag to the remote
//
// The Release workflow runs `prepare`, the build and the tests, `npm publish`, then `push`, so a
// failed test or a failed publish leaves the remote untouched. If publish succeeds and `push` fails,
// npm has a version the repository does not: the error prints the command that finishes the job.
//
// Only commits that touch the library count (cliff.toml, `include_paths`): a playground or CI change
// is not a release. Options: --bump auto|patch|minor|major (default auto: git-cliff reads the
// commits), --dry-run (prepare, print the version and the notes, undo everything), --remote <url>.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PKG = 'packages/fzy-search';
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const phase = args.find((a) => ['notes', 'prepare', 'push'].includes(a)) ?? 'all';
const bump = flag('--bump', 'auto');
const remote = flag('--remote', 'origin');
const dryRun = args.includes('--dry-run');

const run = (cmd, argv, opts = {}) =>
  execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim();
const git = (...argv) => run('git', argv);
// The project's own binaries, not npx: npm refuses to run in a workspace whose devEngines name pnpm.
const cliff = (...argv) => run('node_modules/.bin/git-cliff', argv);
const vp = (...argv) => run('node_modules/.bin/vp', argv, { stdio: 'inherit' });
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const manifestPath = `${PKG}/package.json`;
const manifest = () => JSON.parse(readFileSync(manifestPath, 'utf8'));

function nextVersion() {
  if (bump === 'auto') return cliff('--bumped-version').replace(/^v/, '');
  const [major, minor, patch] = manifest().version.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return fail(`--bump must be auto, patch, minor or major, got "${bump}"`);
}

const notesFor = (tag) => cliff('--tag', tag, '--unreleased', '--strip', 'all');

function notes() {
  const version = nextVersion();
  if (version === manifest().version) return console.log(`Nothing to release: ${PKG} is already ${version}.`);
  console.log(`Next release: ${version}\n\n${notesFor(`v${version}`)}`);
}

function prepare() {
  if (git('branch', '--show-current') !== 'main') fail('Releases are cut from main.');
  if (git('status', '--porcelain')) fail('The working tree is not clean.');
  git('fetch', remote, 'main', '--tags');
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'FETCH_HEAD'))
    fail('main is not the tip of the remote main: pull first.');

  const version = nextVersion();
  if (version === manifest().version) fail(`Nothing to release: ${PKG} is already ${version}.`);
  const tag = `v${version}`;

  // The new section goes on top of the existing changelog. It is not regenerated from every tag:
  // the path filter would drop the entries written before the library moved to packages/.
  cliff('--tag', tag, '--unreleased', '--prepend', `${PKG}/CHANGELOG.md`);
  console.log(`Releasing ${version}\n\n${notesFor(tag)}\n`);
  if (dryRun) {
    git('checkout', '--', '.');
    return;
  }

  const pkg = manifest();
  pkg.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);
  git('add', manifestPath, `${PKG}/CHANGELOG.md`);
  git('commit', '-m', `chore(release): ${tag}`);
  git('tag', '-a', tag, '-m', tag);
  console.log(`Committed ${git('rev-parse', '--short', 'HEAD')} and tagged ${tag}.`);
}

function push() {
  const tag = `v${manifest().version}`;
  try {
    git('push', remote, 'HEAD:main', tag);
  } catch {
    fail(
      `npm has ${tag} but the push failed. Finish by hand: git pull --rebase origin main && git push origin HEAD:main ${tag}`,
    );
  }
}

if (phase === 'notes') {
  notes();
  process.exit(0);
}
if (phase !== 'push') prepare();
if (phase === 'all' && !dryRun) {
  vp('run', 'fzy-search#build');
  vp('test');
  run('npm', ['publish', '--provenance', '--access', 'public'], { cwd: PKG, stdio: 'inherit' });
}
if (phase !== 'prepare' && !dryRun) push();
