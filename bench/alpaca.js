// French-Alpaca-Instruct-55K — 55 184 real French instructions.
//   https://huggingface.co/datasets/jpacifico/French-Alpaca-dataset-Instruct-55K
// Downloaded once and cached. Kept as an ARRAY OF OBJECTS so the benchmark
// exercises the `key` accessor rather than a pre-flattened list of strings.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CACHE = join(dirname(fileURLToPath(import.meta.url)), 'data');
const FILE = join(CACHE, 'french-alpaca.json');
const SRC = 'https://huggingface.co/datasets/jpacifico/French-Alpaca-dataset-Instruct-55K/resolve/main/Acquiesce_data_55k_instructions.json';

export async function loadAlpaca() {
  if (!existsSync(FILE)) {
    mkdirSync(CACHE, { recursive: true });
    const res = await fetch(SRC);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    writeFileSync(FILE, Buffer.from(await res.arrayBuffer()));
  }
  const rows = JSON.parse(readFileSync(FILE, 'utf8'));
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const t = (r.instruction || '').replace(/\s+/g, ' ').trim();
    if (t.length < 8 || seen.has(t)) continue;
    seen.add(t);
    out.push({ id: out.length, instruction: t, output: r.output });
  }
  return out;
}
