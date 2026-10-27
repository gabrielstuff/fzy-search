# AGENTS.md

`fzy-search` is one file of dependency-free JavaScript, `index.js`, with its types in `index.d.ts`:
fuzzy filter and sort for client-side lists. Humans and coding agents work on it under the same rules.
The README is the user documentation; this file is what you need to change the code safely.

## Commands

```sh
npm test                 # test.js, node:test, Node >= 18
npm run test:compat      # test/compat.mjs: dependency-free, runs on the oldest supported Node
npm run check:package    # publint and attw: exports, types, files
npm run check:types      # tsc over test/types.test-d.ts: index.d.ts cannot drift from index.js
node scripts/test-tarball.mjs   # pack, install the tarball in an empty project, import every export
bun test/compat.mjs      # the compat test on Bun; Deno: deno run --unstable-bare-node-builtins test/compat.mjs
npm run check:size       # gzipped bundle cost against the budget in scripts/size.mjs
npm ci                   # root install: tooling only (esbuild, publint, pkg-pr-new)

ONLY=fzy node --expose-gc bench/run.js synthetic   # speed and relevance of this checkout
npm ci --prefix bench --ignore-scripts             # first, once: the benchmark contenders
```

Before you call a change done: `npm test`, `npm run test:compat`, `npm run check:package`,
`npm run check:size`. If you touched `search()`, `vocabHits()` or `wordScore()`, also run the bench
above on this checkout and on `main` and compare `p50`.

## Rules that are not negotiable

- **No runtime dependencies, and one file.** The package is `index.js` + `index.d.ts`. Tooling goes in
  `devDependencies`; the benchmark contenders go in `bench/package.json`, never the root.
- **Defaults never change behaviour.** Every option of `search()` defaults to what it did before it
  existed, and `test.js` checks that passing nothing equals passing the defaults. A new option gets a
  test for its default and a test for what it does.
- **The score tiers never cross.** exact 1000 > prefix 900 > substring 800 > per-word at most 170. Extend
  `test.js` before changing a constant; do not nudge one to fix a single query.
- **The vocabulary loop is the hot path.** It runs once per distinct word per query. Passing the options
  into it as `Math.min(tolerance, Infinity)` made the edit budget a double inside `osa()` and every default
  search 1.8x slower; the unit tests could not see it, only a benchmark on real words did. Keep the budget
  an integer, resolve options once per query word, and measure with the bench before and after.
- **Size is a claim.** The README and `package.json` quote the gzipped size. `npm run check:size` fails
  past the budget in `scripts/size.mjs`; raising it is a decision made in the PR that grows the library,
  with the quoted figures updated in the same PR.

## Node versions

`engines.node` is `>=14`. The ceiling on syntax is ES2020 (`??` and `?.` are in; `??=`, `.at()`,
`Object.hasOwn`, `structuredClone` are out), and `index.js` imports nothing, not even `node:` modules.
`test.js` needs Node 18 (`node:test`), so the floor is enforced by `test/compat.mjs` in CI on Node 14 and
16: keep that file free of anything newer. Raising the floor is a breaking change: a `feat!:` commit.

## Commits, versions, releases

- Commits and **PR titles** are Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `deps:`,
  `build:`, `ci:`, `chore:`, `refactor:`, `test:`). Merges are squashes, so the title is the commit
  message, and git-cliff writes `CHANGELOG.md` and picks the next version from those messages.
  `feat:` is a minor, `fix:`/`perf:` a patch, `feat!:` or a `BREAKING CHANGE:` footer a major (below 1.0, a minor).
- **Never edit `version` in `package.json` or `CHANGELOG.md` by hand.** The release workflow does both.
- A release is one click: the Release workflow (`workflow_dispatch` on `main`, or `npm run release` from
  a maintainer's machine) bumps, tags, publishes to npm with provenance, then pushes. Do not start it
  unless asked. See `.github/RELEASING.md`.
- Every pull request from this repository gets a preview build on pkg.pr.new (a comment on the PR has
  the install command): use it to try a change in a real project before it is merged.

## For projects that vendor this file

Copy `index.js` and `index.d.ts` together from a tagged release and write the tag in the project's own
README. Do not edit the copy: the next copy silently reverts the edit. Send the change here instead.

## Where things are

| | |
| --- | --- |
| `index.js`, `index.d.ts` | the library, in reading order: normalize, osa, index, wordScore, vocabHits, search, highlight |
| `test.js` | the unit tests, `node:test` |
| `test/compat.mjs` | the Node-14-compatible compat test |
| `scripts/size.mjs` | bundle size and its budget |
| `bench/` | the benchmark against five alternatives; its own `package.json` |
| `results.md` | the recorded benchmark results, including the ones that do not flatter the library |
| `llms.txt` | a short API reference for language models |
