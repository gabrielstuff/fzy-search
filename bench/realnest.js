// Real corpora, extracted from RealNest's sample data.
//   https://github.com/cwida/RealNest  (sample-data keeps the licences of its sources)
//
// Two shapes, both much harder than a synthetic generator:
//   abo       32 k Amazon product titles, latin-script locales, ~79 chars, ~26 k distinct words
//   overture  65 k Overture Maps place names + locality, ~38 chars, ~46 k distinct words
//
// First call clones only the two tables it needs (sparse, blobless) and caches
// the extracted corpus as JSON next to this file.
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'data');
const CHECKOUT = join(CACHE, 'RealNest');
const REPO = 'https://github.com/cwida/RealNest.git';

const TABLES = {
  abo: 'sample-data/100mib/amazon-berkeley-objects-listings',
  overture: 'sample-data/100mib/overturemaps-us-west-2-places',
};

const LATIN = new Set(['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sv', 'pl', 'tr']);

const EXTRACT = {
  // product titles — long, multi-word, accented, huge vocabulary
  abo: (r, out) => {
    for (const it of r.item_name ?? []) {
      if (it?.value && LATIN.has(it.language_tag?.slice(0, 2))) out.push(it.value);
    }
  },
  // place names, qualified by their locality — short, proper nouns, umlauts
  overture: (r, out) => {
    const name = r.names?.primary;
    if (!name) return;
    const locality = r.addresses?.[0]?.locality;
    out.push(locality ? `${name} — ${locality}` : name);
  },
};

function checkout(table) {
  if (!existsSync(CHECKOUT)) {
    mkdirSync(CACHE, { recursive: true });
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', REPO, CHECKOUT], { stdio: 'inherit' });
    execFileSync('git', ['sparse-checkout', 'set', ...Object.values(TABLES)], { cwd: CHECKOUT, stdio: 'inherit' });
  }
  const file = join(CHECKOUT, TABLES[table], 'data.jsonl');
  if (!existsSync(file)) throw new Error(`missing ${file} — delete ${CACHE}/RealNest and retry`);
  return file;
}

/** Deduplicated, deterministic list of `{ id, name }`. */
export async function loadCorpus(table, limit = Infinity) {
  const cached = join(CACHE, `${table}.json`);
  if (existsSync(cached)) {
    const all = JSON.parse(readFileSync(cached, 'utf8'));
    return all.slice(0, limit).map((name, id) => ({ id, name }));
  }
  const out = [];
  const rl = createInterface({ input: createReadStream(checkout(table)), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    try { EXTRACT[table](JSON.parse(line), out); } catch { /* skip malformed line */ }
  }
  const unique = [...new Set(out.map((s) => s.replace(/\s+/g, ' ').trim()))].filter((s) => s.length >= 8);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, JSON.stringify(unique));
  return unique.slice(0, limit).map((name, id) => ({ id, name }));
}
