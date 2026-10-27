# fzy-search

> Fuzzy filter and sort for client-side lists

2.6 kB gzipped, no dependencies (3.0 kB if you also pull in `highlight`). Built
for the search box over a list you already have in memory — a few thousand to a
hundred thousand rows — where the user types fast, without accents, and with
typos.

It folds accents and ligatures, counts a transposition as **one** edit
(`sicences` finds `Sciences`), scales the edit budget to word length so short
words stay strict, lets word order float, and requires every query word to land
somewhere — which is what keeps the false-positive rate low.

On four corpora of 20 k–63 k rows, three of them real, it ranks the correct row
first **93–98.5 %** of the time, against 47–83 % for five popular alternatives.
All the numbers, including the ones that do not flatter it, are in
[results.md](https://github.com/gabrielstuff/fzy-search/blob/main/results.md).

**[Try it in the playground →](https://gabrielstuff.github.io/fzy-search/)** on uFuzzy's 161,844-string benchmark corpus, the Fuse.js sample books or 34,969 French communes, with every option, timed per keystroke.

## Install

```sh
npm install fzy-search
```

Node 22 or later, Bun, Deno, and any bundler or browser that reads ES2020. ESM only. Every pull request
also gets a preview build, so an unreleased change can be tried before it ships; the install
command is in a comment on the PR ([pkg.pr.new](https://pkg.pr.new)).

## Usage

```js
import { createIndex, search, highlight } from 'fzy-search';

const index = createIndex(formations, 'name'); // once, not per keystroke

const hits = search('sicences donnes', index, { limit: 20 });
//=> [{item, key, score, i}, …] sorted by descending score

highlight('sicences donnes', index, hits[0].i);
//=> 'DEUST <mark>Science</mark> des <mark>données</mark> - INSA Lyon'
```

## API

### createIndex(source, key?)

Build the index. Do this once when the data arrives, then reuse it for every
keystroke.

#### source

Type: `unknown[] | Record<string, unknown>`

The rows to index.

#### key

Type: `string | ((row) => string) | undefined`

Where to read the text from each row.

```js
createIndex(['Master Sciences', 'CAP Pâtisserie']); // array of strings
createIndex(formations, 'name'); // array of objects
createIndex(formations, 'meta.title'); // dotted path
createIndex(formations, (f) => `${f.name} ${f.city}`); // accessor function
createIndex({ a: 'Doctorat', b: 'Licence' }); // object of strings
createIndex({ a: { n: 'Doctorat' } }, 'n'); // object of objects
```

Missing, `null` and non-string values read as the empty string rather than
throwing.

### search(query, index, options?)

Returns an array of `{item, key, score, i}`, sorted by descending `score`.

`key` is the object key or array index you indexed by; `i` is the internal row id
you pass to `ranges()` and `highlight()`.

#### options.limit

Type: `number`\
Default: `Infinity`

Maximum number of results. Worth setting: with a limit, a running top-N replaces
the sort, which matters when a two-letter query matches 40 000 rows to show ten.

#### Tuning what counts as a match

The defaults suit a filter box: forgiving, as-you-type. When the same index
answers a different question, such as "is this word a misspelling of a name in my
list?", the other options tighten it. Each one defaults to the behaviour above,
so passing none changes nothing.

| Option          | Default     | Effect                                                                           |
| --------------- | ----------- | -------------------------------------------------------------------------------- |
| `prefix`        | `true`      | `false`: `par` no longer finds `paris`.                                          |
| `infix`         | `true`      | `false`: a query word no longer matches inside a longer word.                    |
| `maxEdits`      | `Infinity`  | Caps the edits per word. `1` limits long words to one edit, `0` turns typos off. |
| `minTypoLength` | `0`         | Words shorter than this are never edit-matched.                                  |
| `keepInitial`   | `false`     | An edit-matched word must start with the query word's letter.                    |
| `minCoverage`   | `0`         | `0..1`. The query must account for this share of the row's letters.              |
| `minScore`      | `-Infinity` | Drop rows scoring below this.                                                    |

```js
// "Is this word a misspelling of one of these cities?"
const cities = createIndex(['Rennes', 'Avignon', 'Clermont-Ferrand']);
const typo = {
  prefix: false,
  infix: false,
  maxEdits: 1,
  minTypoLength: 6,
  keepInitial: true,
  minCoverage: 0.8,
  limit: 1,
};
search('renned', cities, typo); // Rennes
search('aivgnon', cities, typo); // Avignon
search('ferrandi', cities, typo); // nothing: it is 8 of the 15 letters of Clermont-Ferrand
```

### highlight(query, index, i, tag?)

The original string of row `i`, with the matched spans wrapped in `tag`
(default `mark`). Everything outside the tags is HTML-escaped.

### ranges(query, index, i)

The same matches as `[start, end)` pairs into the **original**, un-normalized
string — for rendering the highlight yourself.

```js
ranges('sicences donnes', index, hits[0].i);
//=> [[6, 13], [18, 25]]
```

### normalize(string)

`{text, map}` — the folded string, plus `map[i]`, the index of that character in
the source. Exported so you can reuse the same folding elsewhere.

### tolerance(length)

The default edit budget for a word of that length: 0 up to 3 letters, 1 up to 7,
2 beyond. Exported so you can reason about the cap you pass as `maxEdits`.

### osa(a, b, tolerance)

Banded Damerau-Levenshtein (optimal string alignment) distance; returns
`tolerance + 1` as soon as the budget is blown. Exported mostly for testing.

## What it matches

- **Accents, ligatures, apostrophes** are folded away — `Œnologie` ≡ `oenologie`,
  `l’éducation` ≡ `l education` — while highlighting still points back into the
  original string through an index map.
- **Transpositions cost one edit, not two** — `sicences` finds `Sciences`. This is
  Damerau-Levenshtein (OSA), banded so it aborts as soon as the edit budget is
  blown.
- **The edit budget scales with word length**: 0 edits up to 3 letters, 1 up to 7,
  2 beyond. Short words stay strict, so `cop` does not match `CAP`, and `de` does
  not match `monde`.
- **Word order is free** — `commercial management` finds `Management Commercial`,
  with a bonus for keeping the original order.
- **Word prefixes match** — `doct info cloud`.
- **A missing space is recovered** — `informatiquecloud`.
- **Every query word must land somewhere.** One nonsense word and the row is out.
- **Non-Latin queries are never a silent miss** — a query with no ASCII word
  characters (Cyrillic, Greek, …) falls back to a substring scan over the
  normalized texts. Exact, prefix and substring tiers; no fuzz.

## How it stays fast

Three phases, and the row text is not touched until the last one.

1. **Resolve** each query word against the **vocabulary** — the distinct words in
   the corpus, a few thousand to a few tens of thousands — never against every
   row. Exact integer rejects keep edit distance off the hot path: the word is
   too short, too many of the query's letters are missing from it, or the start
   of the word that edit distance would compare holds too many letters the query
   lacks, or lacks too many it has. On uFuzzy's 84,000-word vocabulary, the last
   check spares edit distance nine words in ten of those that reach it.
2. **Walk the postings.** Each vocabulary word points at the rows containing it
   and the position it occupies there. One pass over the matched postings both
   selects the candidate rows and records, per query word, the best score and
   position for each row. Nothing is sliced, nothing is compared again.
3. **Score the survivors** — only rows that satisfied every query word.

## Scoring

The cascade is tiered so the tiers can never cross:

| tier                             | score                       |
| -------------------------------- | --------------------------- |
| normalized text equals the query | 1000                        |
| text starts with the query       | 900                         |
| text contains the query          | 800…801 (earlier is better) |
| per-word matching                | ≤ 170                       |

Per-word: exact 100 · prefix 90 · infix 70 · within edit budget 62 − 12·distance.
The row score is the mean of its query-word scores, plus 30 if the words appear in
order, plus up to 40 for density, so short labels win ties.

Scores are comparable within one index and one query. Do not persist them or
compare them across queries.

## Comparison

Measured on four corpora, three of them real, every query typed without accents.
Full method and per-shape breakdown in [results.md](https://github.com/gabrielstuff/fzy-search/blob/main/results.md).

|                                                            | gzip       | top-1 % (real corpora) | p50 latency    |
| ---------------------------------------------------------- | ---------- | ---------------------- | -------------- |
| **fzy-search**                                             | **2.6 kB** | **93–98.5**            | 2–6 ms         |
| [FlexSearch](https://github.com/nextapps-de/flexsearch)    | 17 kB      | 47–60                  | **0.1–0.5 ms** |
| [MiniSearch](https://github.com/lucaong/minisearch)        | 5.7 kB     | 80–83                  | 5–36 ms        |
| [fuzzysort](https://github.com/farzher/fuzzysort)          | 8.2 kB     | 70–78                  | 8–51 ms        |
| [match-sorter](https://github.com/kentcdodds/match-sorter) | 3.3 kB     | 49–54                  | 100–195 ms     |
| [Fuse.js](https://github.com/krisk/fuse)                   | 9.4 kB     | 65–73                  | 1.0–1.6 **s**  |

**FlexSearch is genuinely faster** — and wrong about half the time, with which
half depending on the `Charset` encoder you picked. Speed is not the scarce
resource in a search box at 63 000 rows.

**MiniSearch is the runner-up**, and the exit ramp: if you need several weighted
fields, stemming or stop words, this library does none of those and MiniSearch
does all three.

## Caveats

- One text field per index. No weights, no multi-field, no stemming, no stop
  words.
- The index is built synchronously and held in memory: 29 MB and ~660 ms at
  53 k rows. Fine on load, not something to redo per keystroke.
- Latency tracks the number of **distinct words**, not the number of rows. Five
  times the rows costs almost nothing; twenty-five times the vocabulary costs 7×.
- Tuned on French and English labels. Other Latin-script languages should behave;
  CJK will fall through to the substring scan, which is correct but not fuzzy.

## Contributing

The thing to watch is the scoring cascade — tiered constants are exactly the code
that rots when someone nudges a magic number to fix one query. The tiers, the edit
budget, the input shapes and the vocabulary prefilter each have a test that fails
loudly. Extend `tests/index.test.ts` before touching a constant.

The repository is a [Vite+](https://viteplus.dev) monorepo: this package in
`packages/fzy-search`, the playground in `apps/playground`.

```sh
vp install                  # pnpm, pinned by the repository
vp run ready                # everything a pull request must pass: check, test, build, size, docs
vp check                    # format, lint and type-check, in one pass
vp test                     # the unit tests (Vitest)
vp dev                      # the playground, with the library's source hot-reloaded
pnpm bench                  # speed and relevance of this checkout against five alternatives
```

Commits and pull-request titles are [Conventional Commits](https://www.conventionalcommits.org):
`feat:` ships a minor, `fix:` and `perf:` a patch, `feat!:` a major (below 1.0, a minor). Merges are
squashes, so the title is the commit message, and the changelog and the next version are written from
those messages by the Release workflow — never edit `version` or `CHANGELOG.md` by hand.
[AI_POLICY.md](https://github.com/gabrielstuff/fzy-search/blob/main/AI_POLICY.md) says how AI-assisted changes are expected to arrive;
[AGENTS.md](https://github.com/gabrielstuff/fzy-search/blob/main/AGENTS.md) has the rules for working on the code, whether you are a person or a coding
agent; [RELEASING.md](https://github.com/gabrielstuff/fzy-search/blob/main/.github/RELEASING.md) has the release flow.

## License

MIT © [Gabriel Delattre](https://github.com/gabrielstuff)
