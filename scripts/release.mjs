// One-click release: version from the commits, changelog, commit, tag, publish, push.
//
//   npm run release                    everything, from a clean, up-to-date main (needs `npm login`)
//   node scripts/release.mjs prepare   bump, changelog, commit, tag: nothing leaves this machine
//   node scripts/release.mjs push      move main and the tag to the remote
//
// The Release workflow runs `prepare`, the tests, `npm publish`, then `push`, so a failed test or a
// failed publish leaves the remote untouched. If publish succeeds and `push` fails, npm has a version
// the repository does not: the error prints the command that finishes the job.
//
// Options: --bump auto|patch|minor|major (default auto: git-cliff reads the commits), --dry-run
// (prepare, print the version and the notes, undo everything), --remote <url> (default origin).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const phase = args.find((a) => ['prepare', 'push'].includes(a)) ?? 'all';
const bump = flag('--bump', 'auto');
const remote = flag('--remote', 'origin');
const dryRun = args.includes('--dry-run');

const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim();
const git = (...argv) => run('git', argv);
const cliff = (...argv) => run('npx', ['--no-install', 'git-cliff', ...argv]);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const manifest = () => JSON.parse(readFileSync('package.json', 'utf8'));

function nextVersion() {
  if (bump === 'auto') return cliff('--bumped-version').replace(/^v/, '');
  const [major, minor, patch] = manifest().version.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return fail(`--bump must be auto, patch, minor or major, got "${bump}"`);
}

function prepare() {
  if (git('branch', '--show-current') !== 'main') fail('Releases are cut from main.');
  if (git('status', '--porcelain')) fail('The working tree is not clean.');
  git('fetch', remote, 'main', '--tags');
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'FETCH_HEAD')) fail('main is not the tip of the remote main: pull first.');

  const version = nextVersion();
  if (version === manifest().version) fail(`Nothing to release: package.json is already ${version}.`);
  const tag = `v${version}`;

  // The changelog is regenerated from every tag, so it never drifts from the commits.
  cliff('--tag', tag, '--output', 'CHANGELOG.md');
  console.log(`Releasing ${version}\n\n${cliff('--tag', tag, '--unreleased', '--strip', 'all')}\n`);
  if (dryRun) {
    git('checkout', '--', '.');
    return;
  }

  // package-lock.json carries the version too; --no-git-tag-version leaves committing to us.
  run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version']);
  git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md');
  git('commit', '-m', `chore(release): ${tag}`);
  git('tag', '-a', tag, '-m', tag);
  console.log(`Committed ${git('rev-parse', '--short', 'HEAD')} and tagged ${tag}.`);
}

function push() {
  const tag = `v${manifest().version}`;
  try {
    git('push', remote, 'HEAD:main', tag);
  } catch {
    fail(`npm has ${tag} but the push failed. Finish by hand: git pull --rebase origin main && git push origin HEAD:main ${tag}`);
  }
}

if (phase !== 'push') prepare();
if (phase === 'all' && !dryRun) {
  run('npm', ['test'], { stdio: 'inherit' });
  run('npm', ['run', 'test:smoke'], { stdio: 'inherit' });
  run('npm', ['publish', '--provenance', '--access', 'public'], { stdio: 'inherit' });
}
if (phase !== 'prepare' && !dryRun) push();
