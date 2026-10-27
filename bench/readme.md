# Benchmark

The harness behind [results.md](../results.md). Five popular libraries against
this one, on four corpora — one synthetic generator plus three real datasets with
large vocabularies.

`results.md` is the reading: method, caveats, what the numbers mean. The numbers
themselves are one file per machine, generated and never edited:
`results-<label>.md` at the repository root, with the machine, the versions and
every table. `results-mbp.md` is a laptop; the Bench workflow
(`.github/workflows/bench.yml`, run by hand) produces one from a GitHub runner,
labelled by its core count unless told otherwise, and opens a draft pull request
with it.

```
corpora.js    corpus registry: synthetic | alpaca | abo | overture
corpus.js       synthetic  20 k generated French formation labels   (406 words)
alpaca.js       alpaca     53 k real French instructions            (14 k words)
realnest.js     abo        32 k real Amazon product titles          (26 k words)
                overture   63 k real Overture Maps place names      (46 k words)
queries.js    labeled queries — 8 query shapes, one correct answer each
adapters.js   one good-faith adapter per contender
run.js        speed / index build / relevance / robustness
noise.js      false-positive rate (queries with no correct answer)
mem.js        retained heap of one index, measured in its own process
scaling.js    how latency scales with vocabulary size
size.js       minified + gzip + brotli bundle cost, via esbuild
sweep.js      the full sweep (~1 h; Fuse.js is most of it): every script above, in its own
              process, into sweep-<label>.json and ../results-<label>.md
report.js     renders a sweep JSON again without rerunning it
```

Every script prints its table and writes its numbers as JSON next to itself;
`SKIP=Fuse,match` leaves contenders out of any of them.

The real corpora download themselves on first use — RealNest via a sparse git
clone, French-Alpaca via HTTP — and cache under `bench/data/`.

```sh
npm ci --prefix bench --ignore-scripts   # the five contenders, from bench/package.json
node bench/size.js                   # bundle cost
node --expose-gc bench/run.js alpaca # one corpus
node bench/sweep.js --label mbp      # everything, into results-mbp.md
node bench/sweep.js --corpora synthetic --skip Fuse   # a quick one
```
