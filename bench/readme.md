# Benchmark

The harness behind [results.md](../results.md). Five popular libraries against
this one, on four corpora — one synthetic generator plus three real datasets with
large vocabularies.

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
all.sh        the full sweep (~1 h; Fuse.js is most of it)
```

The real corpora download themselves on first use — RealNest via a sparse git
clone, French-Alpaca via HTTP — and cache under `bench/data/`.

```sh
npm ci --prefix bench --ignore-scripts   # the five contenders, from bench/package.json
node bench/size.js                   # bundle cost
node --expose-gc bench/run.js alpaca # one corpus
bench/all.sh                         # everything
```
