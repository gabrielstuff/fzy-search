// Retained heap of ONE index, measured as the difference between two fresh
// processes: one that only holds the corpus, one that also holds the index.
// (Measuring a before/after delta inside a single process is unreliable —
// building the index triggers collections that make the delta come out negative.)
import { getCorpus, keyOf } from './corpora.js';
import { adapters } from './adapters.js';

const NAME = process.argv[3] || 'synthetic';
const a = adapters(keyOf(NAME))[Number(process.argv[2])];
const corpus = await getCorpus(NAME);
const settle = async () => { for (let i = 0; i < 20; i++) { global.gc(); await new Promise((r) => setTimeout(r, 25)); } };

// Build once and throw it away, so the baseline reading has already paid for
// whatever heap growth and compaction the build provokes. Then measure.
let scratch = a.build(corpus);
scratch = null;
await settle();
const before = process.memoryUsage().heapUsed;

const handle = a.build(corpus);
await settle();
const after = process.memoryUsage().heapUsed;

if (handle) console.log(JSON.stringify({ name: a.name, mb: (after - before) / 1048576 }));
