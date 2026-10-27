# Benchmark results

Evidence behind the comparison table in [readme.md](readme.md).

This file is the reading: what is measured, how, and the caveats. The numbers below
were taken on a 2 vCPU runner, before the perf work of October 2026, and are kept as
the narrative's reference. Current numbers are generated, one file per machine,
by `node bench/sweep.js --label <machine>`: [results-mbp.md](results-mbp.md) from a
laptop, and the Bench workflow's file from a GitHub runner. Those files hold the
machine, the library versions and every table; they are never edited by hand.

Node 22, 2 vCPU. Four corpora, three of them real. Every query is typed **without
accents** — how people actually search French text — so accent folding is table
stakes, not a bonus category.

| corpus | rows | avg label | distinct words | what it is |
|---|---|---|---|---|
| `synthetic` | 20 000 | 89 ch | 406 | generated French formation labels |
| `alpaca` | 52 725 | 74 ch | 13 636 | real French instructions ([French-Alpaca-55K](https://huggingface.co/datasets/jpacifico/French-Alpaca-dataset-Instruct-55K)) |
| `abo` | 31 948 | 79 ch | 26 372 | real Amazon product titles ([RealNest](https://github.com/cwida/RealNest) / Amazon Berkeley Objects) |
| `overture` | 62 997 | 38 ch | 46 439 | real Overture Maps place names + locality (RealNest) |

200 labeled queries per corpus (8 query shapes × 25, each with exactly one correct
answer), `limit: 10`. Reproduce with `bench/all.sh`.

The synthetic corpus is kept because it is the one that looks like the catalogue
this engine was written for. The three real ones are there because its vocabulary — 406 distinct
words — flatters every inverted-index library, this one included. Everything
below that matters is decided on the real corpora.

## 1. Feature matrix

| | fzy-search | match-sorter | fuzzysort | Fuse.js | MiniSearch | FlexSearch |
|---|---|---|---|---|---|---|
| version tested | — | 8.3.0 | 4.0.2 | 7.5.0 | 7.2.0 | 0.8.212 |
| licence | — | MIT | MIT | Apache-2.0 | MIT | Apache-2.0 |
| weekly npm downloads | — | 3.6 M | 9.4 M | 13.7 M | 2.6 M | 1.4 M |
| algorithm | Damerau-Levenshtein + inverted index | ranked heuristics | subsequence | bitap | inverted index + Levenshtein | inverted index + contextual encoders |
| array of strings / of objects / object map | **all three** | arrays | arrays | arrays | arrays | manual `add()` |
| needs an index | yes | **no** | `prepare()` | yes | yes | yes |
| transpositions (`sicences`) | **yes** | no | no | no (bitap) | yes | only with a phonetic encoder |
| accents / ligatures | **built in** | strips accents | manual | manual | via `processTerm` | via `Charset` |
| word order free | **yes** | no | no | no | yes | yes |
| word prefixes | yes | yes | yes | partly | yes | yes |
| missing space (`artdesign`) | **yes** | incidentally | incidentally | incidentally | no | no |
| match offsets for `<mark>` | yes | no | yes | yes | yes | no |
| multi-field / weights | no | yes | yes | yes | yes | yes |
| stemming / stop words | no | no | no | no | yes | yes |
| async / worker / persistence | no | no | no | no | yes | yes |
| you own the tuning | **yes** | no | no | no | partly | partly |

## 2. Bundle cost — esbuild, minified

Each library bundled alone with only the entry points a search box needs; for
fzy-search that is `createIndex` + `search`. Adding `highlight` brings it to
2.9 kB gzip.

| library | min | **gzip** | brotli |
|---|---|---|---|
| **fzy-search** | 4.9 kB | **2.4 kB** | 2.2 kB |
| match-sorter | 8.8 kB | 3.3 kB | 2.6 kB |
| MiniSearch | 17.3 kB | 5.7 kB | 5.2 kB |
| fuzzysort | 20.6 kB | 8.2 kB | 7.5 kB |
| Fuse.js | 25.9 kB | 9.4 kB | 8.1 kB |
| FlexSearch | 49.4 kB | 17.0 kB | 15.2 kB |

The fzy-search row is re-measured at the current commit; it grew from 2.1 kB when
the relevance and speed runs below were taken, mostly from the non-Latin
substring fallback added afterwards. That path only fires on queries with no
ASCII word characters, so sections 3–8 are unaffected.

## 3. Relevance — top-1 %, 200 queries per corpus

The headline number: how often the one correct row is ranked first.

| library | synthetic | **alpaca** | **abo** | **overture** |
|---|---|---|---|---|
| **fzy-search** | **97.0** | **93.0** | **98.5** | **96.5** |
| MiniSearch | 87.5 | 82.5 | 83.0 | 80.0 |
| fuzzysort | 73.5 | 69.5 | 76.5 | 78.0 |
| Fuse.js | 56.5 | 65.0 | 72.5 | 66.0 |
| FlexSearch (LatinBalance) | 52.5 | 52.5 | 55.0 | 48.5 |
| match-sorter | 50.0 | 48.5 | 49.0 | 54.0 |
| FlexSearch (LatinExtra) | 48.5 | 47.0 | 50.0 | 59.5 |

MRR@10 and recall@10 track top-1 closely; the full tables are in
`bench/results-*.json`.

## 4. False positives — %, 120 queries with no answer

Each query pairs two **real** corpus words that never appear in the same row, so
a matcher that does not require every query word to land will return rows that
matched only half the query. Gibberish would have been the soft version of this
test; this is the honest one. Lower is better, and it is the necessary
counterweight to section 3 — recall is easy to buy with garbage.

| library | synthetic | alpaca | abo | overture |
|---|---|---|---|---|
| FlexSearch (LatinBalance) | 2.5 | 1.7 | **0.0** | **0.0** |
| **fzy-search** | 6.7 | 10.0 | **0.8** | **0.8** |
| MiniSearch | 6.7 | 9.2 | 2.5 | **0.0** |
| FlexSearch (LatinExtra) | 37.5 | 21.7 | 20.8 | 11.7 |
| match-sorter | 75.8 | 92.5 | 76.7 | 20.0 |
| Fuse.js | 82.5 | 96.7 | 93.3 | 99.2 |
| fuzzysort | 97.5 | 99.2 | 95.0 | 65.8 |

fuzzysort answers 99 % of unanswerable queries on real French text. Its
subsequence matching will find the letters of almost anything somewhere in a
74-character sentence.

## 5. Speed — per-query latency, p50 ms

| library | synthetic 20 k | alpaca 53 k | abo 32 k | overture 63 k |
|---|---|---|---|---|
| FlexSearch (LatinBalance) | 1.13 | **0.47** | **0.12** | **0.18** |
| **fzy-search** | **0.24** | 2.17 | 2.76 | 5.69 |
| FlexSearch (LatinExtra) | 1.37 | 4.50 | 2.11 | 1.27 |
| MiniSearch | 8.36 | 36.12 | 4.83 | 12.06 |
| fuzzysort | 22.50 | 50.59 | 26.64 | 7.68 |
| match-sorter | 78.18 | 149.33 | 100.96 | 195.13 |
| Fuse.js | 899.66 | 1615.36 | 1031.43 | 1451.89 |

p95, for the tail that users actually feel:

| library | synthetic | alpaca | abo | overture |
|---|---|---|---|---|
| **fzy-search** | **0.39** | **3.73** | **5.69** | 12.25 |
| FlexSearch (LatinBalance) | 2.06 | 5.85 | 2.68 | **7.04** |
| FlexSearch (LatinExtra) | 2.35 | 7.56 | 3.33 | 5.82 |
| MiniSearch | 26.61 | 142.11 | 29.89 | 47.26 |
| fuzzysort | 65.91 | 153.28 | 70.62 | 25.90 |
| match-sorter | 106.89 | 162.08 | 108.08 | 241.63 |
| Fuse.js | 2240 | 2528 | 1659 | 4350 |

**FlexSearch is faster than fzy-search on real data — and it is fair to say so.** It is
also the library that gets half its answers wrong. fzy-search pays 2–6 ms to be right
96–98 % of the time; FlexSearch pays 0.2–0.5 ms to be right ~50 % of the time.
At a keystroke budget of 16 ms both are free; only one of them is a search box.

Fuse.js is not a typo either. With `ignoreLocation: true` — which it needs to
match anywhere in a long label — bitap runs over every row on every keystroke.
Its default location window is faster and collapses on relevance: on the
synthetic corpus, 17.5 % top-1 at 376 ms/query versus 70.0 % at 785 ms.

## 6. Index build and retained heap

Heap is the index alone, on top of the corpus, measured in a dedicated process
(`bench/mem.js` — an in-process before/after delta comes out negative here,
because building the index provokes collections the baseline never paid for).

| library | build (alpaca 53 k) | heap synthetic | heap alpaca | heap abo | heap overture |
|---|---|---|---|---|---|
| match-sorter | — (no index) | 0 MB | 0 MB | 0 MB | 0 MB |
| Fuse.js | 131 ms | 6.0 MB | 15.7 MB | 9.5 MB | 18.8 MB |
| **fzy-search** | **664 ms** | 10.4 MB | 29.1 MB | 21.8 MB | 33.1 MB |
| FlexSearch (LatinExtra) | 2216 ms | 8.0 MB | 23.2 MB | 24.1 MB | 38.9 MB |
| MiniSearch | 1897 ms | 14.9 MB | 45.4 MB | 37.3 MB | 52.4 MB |
| fuzzysort | 344 ms | 31.1 MB | 69.8 MB | 40.5 MB | 54.7 MB |
| FlexSearch (LatinBalance) | 3186 ms | 14.0 MB | 47.9 MB | 53.1 MB | 90.5 MB |

The index is the normalized text, the word offsets, and postings carrying
(row, word position) pairs. Storing offsets instead of substrings cut it from
28 MB to 8 MB on the synthetic corpus; adding positions to the postings — which
is what removed the per-candidate string slicing — put 2 MB back.

## 7. Typo robustness — top-1 % per query shape, `alpaca` (real French)

| library | exact | transp. | deletion | subst. | reorder | partial | prefix | glued |
|---|---|---|---|---|---|---|---|---|
| **fzy-search** | 96 | **100** | **96** | 92 | 88 | **100** | **100** | **72** |
| MiniSearch | **100** | 44 | 92 | **96** | 92 | 96 | 96 | 44 |
| fuzzysort | **100** | 24 | 64 | 12 | 92 | 88 | 96 | 80 |
| Fuse.js | 92 | 92 | 84 | 88 | 20 | 48 | 12 | 84 |
| match-sorter | 84 | 12 | 76 | 0 | 4 | 80 | 60 | 72 |
| FlexSearch (LatinBalance) | 96 | 8 | 16 | 20 | 92 | 84 | **100** | 4 |
| FlexSearch (LatinExtra) | 72 | 36 | 44 | 28 | 68 | 68 | 48 | 12 |

Real queries from this corpus:

| shape | query | correct answer |
|---|---|---|
| exact | `atteint le pole nord` | Trouve des informations sur la première personne à avoir atteint le pôle Nord. |
| transposition | `amtiie basee sur` | Ecris une chanson sur le thème de l'amitié basée sur les paroles suivantes. |
| deletion | `prier pour la paix` | Crée une prière pour la paix dans le monde. |
| substitution | `une pizza fait maisom` | Montre-moi comment cuisiner une pizza fait maison. |
| reorder | `salade four mixte` | Crée une liste de courses … pommes de terre au four, salade mixte … |
| partial | `pese l le` | Combien pèse l'animal le plus lourd du monde ? |
| prefix | `pheno leque cert` | Comment se nomme le phénomène par lequel certaines molécules … |
| glued | `parvenir a unaccord` | Décris les différentes étapes … pour parvenir à un accord … |

The pattern holds on `abo` and `overture` (both in `sweep`-style output from
`bench/all.sh`): everyone handles exact and prefix; transposition and
substitution are where bitap and subsequence matchers fall apart; `glued` is
where the inverted-index libraries do, MiniSearch included (12–44 %).

## 8. Where the cost lives

Latency tracks the number of **distinct words**, not the number of rows
(`bench/scaling.js`, synthetic vocabularies):

| rows | distinct words | build | p50 | p95 |
|---|---|---|---|---|
| 20 000 | 500 | 240 ms | 0.22 ms | 0.45 ms |
| 20 000 | 4 736 | 274 ms | 0.95 ms | 2.01 ms |
| 20 000 | 12 591 | 348 ms | 1.56 ms | 4.03 ms |
| 100 000 | 4 736 | 1453 ms | 1.31 ms | 2.23 ms |
| 100 000 | 12 591 | 1544 ms | 1.86 ms | 4.11 ms |

Five times the rows costs almost nothing; twenty-five times the vocabulary costs
7×. The real corpora agree: `overture` (46 k words) is the slowest at 5.7 ms
despite having the shortest labels.

Three changes got real data from 17–30 ms down to 2–6 ms, in order of value:

1. **Two exact integer rejects before edit distance** (word too short; too many
   of the query's letters missing). 4.5× on both real corpora.
2. **Scoring during the postings walk.** Postings carry (row, word position), so
   one pass finds the candidates *and* scores every query word against them. No
   row text is sliced, and no word is compared twice. Worst case on `abo` went
   from 31 ms to 11 ms.
3. **A running top-N instead of a sort.** A two-letter query can match 40 000
   rows to show ten: `de` on `alpaca` went from 30 ms to 4 ms.

The remaining lever, if the vocabulary ever passes ~50 k words, is to bucket it
by word length instead of scanning it linearly.

## 9. Honest caveats

- **The same author wrote the queries and the engine.** The eight query shapes came first,
  but they were known while writing the scoring cascade — `glued` in particular is a
  category fzy-search has an explicit feature for, and MiniSearch scores 12–44 % on it
  purely because nobody thought that case was worth handling. Read section 7 as
  "which failure modes each library has", not as a neutral leaderboard.
  Sections 3 and 4 together are the fairer summary.
- **Perturbations are generated, not observed.** One edit per word, applied by a
  script. Real users make correlated mistakes, and they also give up and retype.
- **None of these corpora is the catalogue this was built for.** `alpaca` is real French with
  a real vocabulary and is the closest proxy; `abo` matches the label *shape*
  (long, multi-word, accented product-like titles). A real export would settle
  the last few points.
- **The libraries are configured, not tuned.** Each got a good-faith config
  including accent folding, and FlexSearch got two encoders because the choice
  changes everything about its results. More tuning would move their numbers.
- **fzy-search does less.** No multi-field weighting, no stemming, no stop words, no
  workers, no persistence, no async. If the search box ever has to cover several
  fields with weights, MiniSearch is where to go.
