// Type tests: `vp check` type-checks this file, and every `@ts-expect-error` line must still be an error.
// dist/index.d.ts is generated from src/index.ts; this file pins the public API it describes, so changing that
// API is a decision made here, in the diff, and never a side effect of a refactor.
import {
  createIndex,
  highlight,
  normalize,
  osa,
  ranges,
  search,
  tolerance,
  type FzyIndex,
  type Key,
  type SearchOptions,
  type SearchResult,
} from '../src/index.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <_T extends true>() => {};

type Row = { name: string; meta: { title: string } };
const rows: Row[] = [{ name: 'Paris', meta: { title: 'Ville' } }];

// createIndex: strings, rows with a key, rows with a path or a function, and an object map
const strings = createIndex(['Paris', 'Rennes']);
assertType<Equal<typeof strings, FzyIndex<string>>>();
const byName = createIndex(rows, 'name');
assertType<Equal<typeof byName, FzyIndex<Row>>>();
createIndex(rows, 'meta.title');
createIndex(rows, (row) => row.name);
createIndex(rows, null);
createIndex(rows, undefined);
const map = createIndex({ a: 'Paris', b: 'Rennes' });
assertType<Equal<typeof map, FzyIndex<string>>>();

// @ts-expect-error a number is not a source
createIndex(3);
// @ts-expect-error the key function must return a string
createIndex(rows, (row) => row.meta);
// @ts-expect-error a key function receives the row, not a string
createIndex(rows, (row: number) => String(row));

// search: the result shape follows the row type
const hits = search('par', byName);
assertType<Equal<typeof hits, Array<SearchResult<Row>>>>();
const hit = hits[0]!;
assertType<Equal<typeof hit.item, Row>>();
assertType<Equal<typeof hit.key, string | number>>();
assertType<Equal<typeof hit.score, number>>();
assertType<Equal<typeof hit.i, number>>();
// @ts-expect-error results are read-only
hit.score = 1;

// every option, and the defaults documented in index.d.ts
const options: SearchOptions = {
  limit: 20,
  prefix: false,
  infix: false,
  maxEdits: 1,
  minTypoLength: 4,
  keepInitial: true,
  minCoverage: 1,
  minScore: 100,
};
search('par', byName, options);
search('par', byName, {});
search('par', byName, { limit: Infinity });

// @ts-expect-error an unknown option is a typo, not a silent no-op
search('par', byName, { maxEdit: 1 });
// @ts-expect-error limit is a number
search('par', byName, { limit: '20' });
// @ts-expect-error keepInitial is a boolean
search('par', byName, { keepInitial: 1 });
// @ts-expect-error the query is a string
search(3, byName);
// @ts-expect-error the second argument is an index, not the rows
search('par', rows);

// ranges and highlight accept an index of any row type
assertType<Equal<ReturnType<typeof ranges>, Array<[start: number, end: number]>>>();
ranges('par', byName, hit.i);
ranges('par', strings, 0);
assertType<Equal<ReturnType<typeof highlight>, string>>();
highlight('par', byName, hit.i);
highlight('par', byName, hit.i, 'b');
// @ts-expect-error the row id is a number
highlight('par', byName, 'a');

// the helpers
assertType<Equal<ReturnType<typeof tolerance>, number>>();
assertType<Equal<ReturnType<typeof osa>, number>>();
assertType<Equal<ReturnType<typeof normalize>, { text: string; map: number[] }>>();
osa('sicences', 'sciences', 2);
// @ts-expect-error all three arguments are required
osa('a', 'b');

const key: Key<Row> = 'name';
void key;
