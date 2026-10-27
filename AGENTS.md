# AGENTS.md

`fzy-search` is fuzzy filter and sort for client-side lists: one dependency-free TypeScript module,
`packages/fzy-search/src/index.ts`, built into one ES2020 file with its declarations. The repository is a
[Vite+](https://viteplus.dev) monorepo. Humans and coding agents work on it under the same rules. The package
README is the user documentation; this file is what you need to change the code safely.

## Commands

`vp` is the Vite+ CLI. Without the global install, run the project's copy: `pnpm exec vp …` (or
`node_modules/.bin/vp`). `npx` does not work here: npm refuses a workspace whose `devEngines` name pnpm.

```sh
vp install                      # the pinned pnpm, every workspace package
vp run ready                    # what a pull request must pass: check, test, build, size, docs
vp check                        # format (Oxfmt), lint (Oxlint) and type-check (tsgo), in one pass
vp check --fix                  # the same, fixing what can be fixed
vp hooks enable                 # opt in: `vp staged` (check --fix on staged files) before each commit
vp test                         # Vitest, packages/fzy-search/tests
vp dev                          # the playground on http://localhost:5173/fzy-search/, library source hot-reloaded
vp run fzy-search#build         # vp pack: dist/index.js + index.d.ts, then publint and attw (cached)
vp run fzy-search#size          # the gzipped cost of dist/, against the budget and the quoted figures
vp run fzy-search#docs          # every option and export of dist/index.d.ts is in the readme, llms.txt, the skill
vp run fzy-search#tarball       # pack, install in an empty project, import by name
node scripts/test-tarball.mjs --runtimes node,bun,deno   # the same on the three runtimes, as CI does
node scripts/release.mjs notes  # the next version and its release notes for this checkout; changes nothing

npm ci --prefix bench --ignore-scripts                     # first, once: the benchmark contenders
ONLY=fzy node --expose-gc bench/run.js synthetic           # speed and relevance of dist/ (build first)
FZY_LIB=/path/to/other/index.js ONLY=fzy node --expose-gc bench/run.js synthetic   # another build, same harness
```

Before you call a change done: `vp run ready`. If you touched `search()`, `vocabHits()`, `wordScore()` or
`osa()`, also run the bench on this checkout and on `main` (`FZY_LIB`) and compare `p50`, in separate
processes: two builds in one process measure the load order, not the code.

## How to work here

- **State your assumptions** before a change that depends on one, and ask when two readings of the task
  lead to different code.
- **Make the smallest change that does the task.** No drive-by refactors, no new options "for later", no
  abstraction for a single caller. `src/index.ts` is meant to stay readable in one sitting.
- **Surgical diffs.** Every changed line traces back to the task. `vp check --fix` owns the formatting; the
  comment density of the file is yours to match.
- **Define the check, then loop until it passes.** Before you start, name the command that proves the change
  (a test that fails now, a bench number, a size). Run it, fix, run it again; say what you ran and what it said.
- **Do not cut a release** (`pnpm release`, or the Release workflow), tag, publish, or touch `version` or
  `CHANGELOG.md`. Do not raise the size budget or move a score constant on your own.
- **Keep your judgment.** Pick one option and say why instead of relaying three. A pull request you open is
  read in full by a human before it is marked ready for review, and the PR template asks them to say AI helped.
  See [AI_POLICY.md](AI_POLICY.md).

## Rules that are not negotiable

- **No runtime dependencies.** The published package is `dist/` plus its docs. Tooling goes in
  `devDependencies`, shared versions in the pnpm catalog (`pnpm-workspace.yaml`); the benchmark contenders go
  in `bench/package.json`, which is outside the workspace on purpose, so no CI install ever fetches them.
- **The types are generated, the docs are not.** `vp pack` writes `dist/index.d.ts` from `src/index.ts`, doc
  comments included: an export's `/** */` comment is its published documentation. `tests/types.test-d.ts`
  pins the public API (every export, option and result shape, and what must not compile); `vp check`
  type-checks it.
- **Defaults never change behaviour.** Every option of `search()` defaults to what it did before it
  existed, and the tests check that passing nothing equals passing the defaults. A new option gets a
  test for its default and a test for what it does.
- **The score tiers never cross.** exact 1000 > prefix 900 > substring 800 > per-word at most 170. Extend
  `tests/index.test.ts` before changing a constant; do not nudge one to fix a single query.
- **The vocabulary loop is the hot path.** It runs once per distinct word per query. Passing the options
  into it as `Math.min(tolerance, Infinity)` made the edit budget a double inside `osa()` and every default
  search 1.8x slower; the unit tests could not see it, only a benchmark on real words did. Keep the budget
  an integer, resolve options once per query word, and measure with the bench before and after. Type
  annotations are free; a helper function called per row or per vocabulary word is not.
- **Size is a claim.** The package README, `package.json` and `llms.txt` quote the gzipped size, and so does
  the root README. `vp run fzy-search#size` fails past the budget in `scripts/size.mjs`, and when a quoted
  figure is not the measured one rounded to 0.1 kB. Raising the budget is a decision made in the PR that
  grows the library, with the figures updated in the same PR. Every PR gets a comment with the delta.

## Runtimes and the ES2020 ceiling

`engines.node` is `>=22`: CI runs the tests on Node 22, 24 and 26, and the packed tarball on Node, Bun and
Deno. What ships goes to browsers and bundlers as written, so it stays ES2020, and both halves of that are
enforced rather than remembered: `vp pack` targets ES2020 (syntax), and the package `tsconfig.json` has
`lib: ["es2020"]` (built-ins: `.at()`, `Object.hasOwn`, `structuredClone` do not type-check). `src/index.ts`
imports nothing, not even `node:` modules. Raising the Node floor is a breaking change: a `feat!:` commit.

## Commits, versions, releases

- Commits and **PR titles** are Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `deps:`,
  `build:`, `ci:`, `chore:`, `refactor:`, `test:`). Merges are squashes, so the title is the commit
  message, and git-cliff writes `packages/fzy-search/CHANGELOG.md` and picks the next version from those
  messages. Only commits that touch the library count (`include_paths` in `cliff.toml`): a playground or
  CI change is not a release. `feat:` is a minor, `fix:`/`perf:` a patch, `feat!:` or a `BREAKING CHANGE:`
  footer a major (below 1.0, a minor).
- **Never edit `version` or `CHANGELOG.md` by hand.** The release workflow does both.
- A release is one click: the Release workflow (`workflow_dispatch` on `main`, or `pnpm release` from a
  maintainer's machine) bumps, tags, builds, tests, publishes to npm with provenance, then pushes. Do not
  start it unless asked. See `.github/RELEASING.md`.
- Every pull request from this repository gets a preview build on pkg.pr.new (a comment on the PR has
  the install command): use it to try a change in a real project before it is merged.

## Consumers

Install it from npm: `npm install fzy-search`. Vendoring a copy is no longer the way: the published package
is built, typed, provenance-attested and tested on three runtimes, a copy is none of those. A project that
still vendors one should move to the npm package and send any local change here.

## Where things are

|                                                                              |                                                                                                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/fzy-search/src/index.ts`                                           | the library, in reading order: normalize, osa, index, wordScore, vocabHits, search, highlight                                                                  |
| `packages/fzy-search/tests/`                                                 | `index.test.ts`, the unit tests (Vitest); `types.test-d.ts`, the public API, type-checked                                                                      |
| `packages/fzy-search/vite.config.ts`                                         | `pack` (the build), `test`, and the package tasks: build, size, docs, tarball                                                                                  |
| `packages/fzy-search/README.md`, `llms.txt`, `skills/`                       | what ships with the package: the docs, an API summary for language models, the agent skill                                                                     |
| `apps/playground/`                                                           | the live demo on GitHub Pages (`.github/workflows/pages.yml`): vanilla TypeScript, `vp dev` hot-reloads the library source, `vp build` runs against `dist/`    |
| `vite.config.ts`                                                             | workspace-wide format, lint and type-check rules, the pre-commit check, the `ready` task                                                                       |
| `pnpm-workspace.yaml`                                                        | the workspace, the tool catalog, which dependencies may run install scripts (none)                                                                             |
| `bench/`, `results.md`                                                       | the benchmark against five alternatives (its own install), and the recorded results                                                                            |
| `scripts/release.mjs`, `cliff.toml`                                          | the release: version, changelog, tag, publish                                                                                                                  |
| `scripts/size.mjs`, `scripts/check-docs.mjs`, `scripts/test-tarball.mjs`     | size budget, docs drift, packed-tarball checks                                                                                                                 |
| `.github/workflows/size.yml`, `size-comment.yml`, `scripts/size-comment.mjs` | the size delta comment on pull requests: one job measures with a read-only token, another posts two validated integers. Never make the posting job run PR code |
