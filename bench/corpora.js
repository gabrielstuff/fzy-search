// One entry point for every corpus the benchmark can run against.
//   synthetic         20 000 generated French formation labels (small vocabulary)
//   synthetic:50000   any size
//   abo               32 k real Amazon product titles      (26 k distinct words)
//   overture          63 k real Overture Maps place names  (46 k distinct words)
//   alpaca            55 k real French instructions        (array of objects, key 'instruction')
import { buildCorpus } from './corpus.js';
import { loadCorpus } from './realnest.js';
import { loadAlpaca } from './alpaca.js';

// Every corpus is an array of objects; `keyOf` says which property holds the text.
export const keyOf = (name) => (name === 'alpaca' ? 'instruction' : 'name');

export async function getCorpus(name) {
  if (name.startsWith('synthetic')) return buildCorpus(Number(name.split(':')[1] || 20000));
  if (name === 'alpaca') return loadAlpaca();
  return loadCorpus(name);
}
