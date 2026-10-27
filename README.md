# fzy-search

> Fuzzy filter and sort for client-side lists. 2.6 kB gzipped, no dependencies.

**[Playground](https://gabrielstuff.github.io/fzy-search/)** · [Documentation](packages/fzy-search/README.md) ·
[npm](https://www.npmjs.com/package/fzy-search) · [Benchmark](results.md)

```sh
npm install fzy-search
```

```js
import { createIndex, search, highlight } from 'fzy-search';

const index = createIndex(formations, 'name'); // once, not per keystroke
const hits = search('sicences donnes', index, { limit: 20 });
highlight('sicences donnes', index, hits[0].i);
//=> 'DEUST <mark>Science</mark> des <mark>données</mark> - INSA Lyon'
```

It folds accents and ligatures, counts a transposition as one edit, scales the edit budget to the word
length, lets word order float, and requires every query word to land somewhere. On four corpora of
20 k–63 k rows, three of them real, it ranks the correct row first 93–98.5 % of the time, against
47–83 % for five popular alternatives. The [documentation](packages/fzy-search/README.md) has the API,
the scoring and the caveats.

## This repository

A [Vite+](https://viteplus.dev) monorepo. One `vite.config.ts` at the root formats, lints and type-checks
everything in one pass; each package builds, tests and caches its own tasks.

|                                              |                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`packages/fzy-search`](packages/fzy-search) | the library: TypeScript in `src/`, built by `vp pack` into one ES2020 module with its declarations, tested by `vp test` |
| [`apps/playground`](apps/playground)         | the live demo on GitHub Pages, a Vite app built against the exact `dist/` that ships                                    |
| [`bench`](bench)                             | the benchmark against five alternatives, with its own install so the contenders never reach a publish job               |
| [`scripts`](scripts)                         | release, size budget, docs drift and packed-tarball checks                                                              |

```sh
vp install        # the pinned pnpm, every package
vp run ready      # what a pull request must pass: check, test, build, size budget, docs drift
vp dev            # the playground, with the library's source hot-reloaded into it
vp check --fix    # format, lint and type-check, fixing what can be fixed
```

`vp` is the [Vite+](https://viteplus.dev/guide/) CLI. Without the global install, `pnpm exec vp …` runs the
project's own copy.

Contributing: [AGENTS.md](AGENTS.md) (the rules, for people and coding agents), [AI_POLICY.md](AI_POLICY.md),
[.github/RELEASING.md](.github/RELEASING.md). MIT © [Gabriel Delattre](https://github.com/gabrielstuff).
