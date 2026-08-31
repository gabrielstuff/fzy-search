#!/usr/bin/env bash
# Full sweep: every corpus, every metric. Takes ~1 h — Fuse.js is most of it.
set -u
cd "$(dirname "$0")/.."
: "${PER_CATEGORY:=25}"
export PER_CATEGORY
node bench/size.js
for c in synthetic alpaca abo overture; do
  echo; echo "################ $c"
  node --expose-gc bench/run.js "$c"
  node --expose-gc bench/noise.js "$c"
  echo "## Index heap — $c"
  for i in 0 1 2 3 4 5 6; do node --expose-gc bench/mem.js "$i" "$c"; done
done
node bench/scaling.js
