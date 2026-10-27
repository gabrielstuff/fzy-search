// One adapter per contender. Each gets a good-faith config for accented,
// multi-word French labels — including accent folding where the library
// does not do it by default.
import { matchSorter } from 'match-sorter';
import fuzzysort from 'fuzzysort';
import Fuse from 'fuse.js';
import MiniSearch from 'minisearch';
import FlexSearch from 'flexsearch';
import { createIndex, search as fzySearch, LIB_PATH } from './lib.js';


const deaccent = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').toLowerCase();

// SKIP=Fuse,match-sorter leaves those contenders out of every script; Fuse.js is most of a sweep's hour.
const SKIP = (process.env.SKIP ?? '').split(',').filter(Boolean);

/** Adapters for a corpus whose text lives at `items[i][key]`. */
export const adapters = (key = 'name') => all(key).filter((a) => !SKIP.some((s) => a.name.toLowerCase().includes(s.toLowerCase())));

const all = (key) => [
  {
    name: 'fzy-search',
    build: (items) => createIndex(items, key),
    search: (h, q, limit) => fzySearch(q, h, { limit }).map((r) => r.item.id),
    entry: `import {createIndex,search} from ${JSON.stringify(LIB_PATH)}; export {createIndex,search}`,
  },
  {
    name: 'match-sorter',
    build: (items) => items,                       // no index: scans on every keystroke
    search: (h, q, limit) => matchSorter(h, q, { keys: [key] }).slice(0, limit).map((x) => x.id),
    entry: `import {matchSorter} from 'match-sorter'; export {matchSorter}`,
  },
  {
    name: 'fuzzysort',
    build: (items) => items.map((it) => ({ id: it.id, n: fuzzysort.prepare(deaccent(it[key])) })),
    search: (h, q, limit) => fuzzysort.go(deaccent(q), h, { keys: ['n'], limit, threshold: 0 }).map((r) => r.obj.id),
    entry: `import f from 'fuzzysort'; export default f`,
  },
  {
    name: 'Fuse.js',
    build: (items) => new Fuse(items, {
      keys: [key], threshold: 0.4, ignoreLocation: true, minMatchCharLength: 2, includeScore: true,
    }),
    search: (h, q, limit) => h.search(q, { limit }).map((r) => r.item.id),
    entry: `import Fuse from 'fuse.js'; export default Fuse`,
  },
  {
    name: 'MiniSearch',
    build: (items) => {
      const ms = new MiniSearch({ fields: [key], idField: 'id', processTerm: (t) => deaccent(t) });
      ms.addAll(items);
      return ms;
    },
    search: (h, q, limit) =>
      h.search(q, { fuzzy: 0.2, prefix: true, combineWith: 'AND' }).slice(0, limit).map((r) => r.id),
    entry: `import M from 'minisearch'; export default M`,
  },
  {
    name: 'FlexSearch (LatinBalance)',
    build: (items) => {
      const idx = new FlexSearch.Index({ tokenize: 'forward', encoder: FlexSearch.Charset.LatinBalance });
      for (const it of items) idx.add(it.id, it[key]);
      return idx;
    },
    search: (h, q, limit) => h.search(q, { limit }),
    entry: `import F from 'flexsearch'; export default F`,
  },
  {
    name: 'FlexSearch (LatinExtra)',
    build: (items) => {
      const idx = new FlexSearch.Index({ tokenize: 'forward', encoder: FlexSearch.Charset.LatinExtra });
      for (const it of items) idx.add(it.id, it[key]);
      return idx;
    },
    search: (h, q, limit) => h.search(q, { limit }),
    entry: `import F from 'flexsearch'; export default F`,
  },
];
