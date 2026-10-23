/**
A search hit.

@typeParam Item - The row type that was indexed.
*/
export type SearchResult<Item = unknown> = {
	/** The original row. */
	readonly item: Item;

	/** The object key it was indexed under, or its array index. */
	readonly key: string | number;

	/** Descending relevance. See the scoring cascade in the readme. */
	readonly score: number;

	/** Internal row id. Pass it to `ranges()` and `highlight()`. */
	readonly i: number;
};

/**
A built index. Create it with {@link createIndex}. The fields are internal.
*/
export type FzyIndex<Item = unknown> = {
	readonly items: readonly Item[];
	readonly keys: readonly (string | number)[] | null;
	readonly texts: readonly string[];
	readonly getText: (row: Item) => string;
};

export type SearchOptions = {
	/**
	Maximum number of results.

	With a limit, a running top-N replaces the sort, which matters when a short query matches tens of thousands of rows.

	@default Infinity
	*/
	readonly limit?: number;

	/**
	A query word matches the start of a longer word (`par` finds `paris`). Turn it off when the query is expected to be complete.

	@default true
	*/
	readonly prefix?: boolean;

	/**
	A query word matches the inside of a longer word. Never applies to words of 1-2 letters.

	@default true
	*/
	readonly infix?: boolean;

	/**
	Upper bound on the edits forgiven per query word. The built-in budget is {@link tolerance}: 0 edits up to 3 letters, 1 up to 7, 2 beyond. `maxEdits: 1` caps the long words at 1; `maxEdits: 0` turns typo matching off.

	@default Infinity
	*/
	readonly maxEdits?: number;

	/**
	Query words shorter than this are never edit-matched, whatever the budget says. Short words are where typo matching turns ordinary words into other ordinary words.

	@default 0
	*/
	readonly minTypoLength?: number;

	/**
	An edit-matched word must start with the same letter as the query word. Typos rarely hit the first letter, and requiring it removes most false positives at no cost to recall.

	@default false
	*/
	readonly keepInitial?: boolean;

	/**
	From 0 to 1: the share of a row's letters the query words must account for. `1` keeps rows the query spells out completely; it rejects `ferrandi` against `Clermont-Ferrand` (8 of 15 letters) while keeping `renned` against `Rennes`.

	@default 0
	*/
	readonly minCoverage?: number;

	/**
	Drop rows scoring below this. The score tiers are in the readme.

	@default -Infinity
	*/
	readonly minScore?: number;
};

/**
How many edits are forgiven in a word of length `n` by default: 0 up to 3 letters, 1 up to 7, 2 beyond.

Exported so a caller can reason about the budget it is capping.

@example
```
tolerance(6);
//=> 1
```
*/
export function tolerance(n: number): number;

/**
Where to read the text from each row.

- Omitted — the row is already a string.
- `'name'` — a property. Dotted paths allowed: `'meta.title'`.
- A function — anything you like.

Missing, `null` and non-string values read as the empty string rather than throwing.
*/
export type Key<Item> = string | ((row: Item) => string) | null | undefined;

/**
Build a search index. Do this once, not per keystroke.

@param source - The rows to index: an array, or a plain object map.
@param key - Where to read the text.

@example
```
import {createIndex, search} from 'fzy-search';

const index = createIndex(['Master Sciences', 'CAP Pâtisserie']);

search('patisserie', index);
//=> [{item: 'CAP Pâtisserie', key: 1, score: 800.2, i: 1}]
```

@throws {TypeError} If `source` is not an array or a plain object.
*/
export function createIndex<Item>(source: readonly Item[], key?: Key<Item>): FzyIndex<Item>;
export function createIndex<Item>(source: Readonly<Record<string, Item>>, key?: Key<Item>): FzyIndex<Item>;

/**
Fuzzy filter and sort, ordered by descending score.

Every query word must land somewhere, which is what keeps precision high: one nonsense word and the row is out.

@example
```
import {createIndex, search} from 'fzy-search';

const index = createIndex(formations, 'name');

search('sicences donnes', index, {limit: 20});
//=> [{item: {name: 'DEUST Science des données - INSA Lyon'}, key: 0, score: 89.13, i: 0}, …]
```
*/
export function search<Item>(query: string, index: FzyIndex<Item>, options?: SearchOptions): Array<SearchResult<Item>>;

/**
Matched ranges `[start, end)` in the **original**, un-normalized string of row `i`, merged and sorted.

@example
```
ranges('sicences donnes', index, hits[0].i);
//=> [[6, 13], [18, 25]]
```
*/
export function ranges(query: string, index: FzyIndex<any>, i: number): Array<[start: number, end: number]>;

/**
The original string of row `i` with the matches wrapped in `tag`. Everything outside the tags is HTML-escaped.

@param tag - @default 'mark'

@example
```
highlight('sicences donnes', index, hits[0].i);
//=> 'DEUST <mark>Science</mark> des <mark>données</mark> - INSA Lyon'
```
*/
export function highlight(query: string, index: FzyIndex<any>, i: number, tag?: string): string;

/**
Lowercase, de-accent, de-ligature. `map[i]` is the index of that character in the source string, which is how highlighting points back into the original.

Exported for testing and for reusing the same folding elsewhere.

@example
```
normalize('Œnologie');
//=> {text: 'oenologie', map: [0, 0, 1, 2, 3, 4, 5, 6, 7]}
```
*/
export function normalize(string: string): {text: string; map: number[]};

/**
Damerau-Levenshtein (optimal string alignment) distance, banded: it stops and returns `tolerance + 1` as soon as the edit budget is blown.

A transposition costs one edit, not two, which is why `sicences` finds `sciences`.

Exported for testing.

@example
```
osa('sicences', 'sciences', 2);
//=> 1
```
*/
export function osa(a: string, b: string, tolerance: number): number;
