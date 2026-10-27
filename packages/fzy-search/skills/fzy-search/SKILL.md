---
name: fzy-search
description: Use fzy-search to filter and sort a list that is already in memory (a search box, a combobox, a typeahead), or to check whether a typed word is a misspelling of one of a list of names. Covers which options to pass for each, and the one limit of typo matching. Use when code imports `fzy-search`, or when you are about to hand-write fuzzy matching, accent folding or an edit-distance function for a client-side list.
---

# fzy-search

Fuzzy filter and sort for client-side lists. One file, no dependencies, ESM. It folds accents and ligatures,
counts a transposition as one edit, scales the edit budget to word length, ignores word order, and requires
every query word to match. Types ship in the package (`index.d.ts`): trust them over this file if they differ.

```js
import { createIndex, search, highlight } from 'fzy-search';

const index = createIndex(rows, 'name'); // once when the data arrives, never per keystroke
const hits = search(query, index, { limit: 20 });
// [{ item, key, score, i }], best first. `item` is your row, `i` goes to highlight()/ranges().
highlight(query, index, hits[0].i); // HTML, matches wrapped in <mark>, the rest escaped
```

`rows` is an array of strings, an array of objects with a key (`'name'`, `'meta.title'` or `(row) => string`),
or an object map. Missing and non-string values read as the empty string.

## Use case 1: a filter box over a list

Pass nothing but `limit`. The defaults are forgiving on purpose: prefix and infix matches, typos scaled to the
word length (0 edits up to 3 letters, 1 up to 7, 2 beyond), accents ignored.

```js
search(query, index, { limit: 20 });
```

Always set `limit` on a box that shows ten rows: a running top-N replaces the sort, which matters when a
two-letter query matches tens of thousands of rows. Do not debounce to avoid a cost the library does not have.

## Use case 2: is this word a misspelling of one of these names?

Same index, tightened. This is the preset for "did the user mean Rennes?", not for filtering:

```js
const cities = createIndex(['Rennes', 'Avignon', 'Clermont-Ferrand']);
const typo = {
  prefix: false,
  infix: false,
  maxEdits: 1,
  minTypoLength: 6,
  keepInitial: true,
  minCoverage: 0.8,
  limit: 1,
};
search('renned', cities, typo); // Rennes
search('ferrandi', cities, typo); // [] : 8 of the 15 letters of Clermont-Ferrand
```

| Option          | Default     | What it does                                                   |
| --------------- | ----------- | -------------------------------------------------------------- |
| `limit`         | `Infinity`  | Maximum results.                                               |
| `prefix`        | `true`      | `false`: `par` no longer finds `paris`.                        |
| `infix`         | `true`      | `false`: a query word no longer matches inside a longer word.  |
| `maxEdits`      | `Infinity`  | Caps edits per word; `0` turns typo matching off.              |
| `minTypoLength` | `0`         | Words shorter than this are never edit-matched.                |
| `keepInitial`   | `false`     | An edit-matched word must start with the query word's letter.  |
| `minCoverage`   | `0`         | `0..1`: share of the row's letters the query must account for. |
| `minScore`      | `-Infinity` | Drop rows scoring below this.                                  |

Every option defaults to the behaviour before it existed, so passing none changes nothing.

## The limit you must know

One edit on an ordinary word cannot be told from a typo: `commerce` is one edit from `Commercy`. The options
shrink the false positives, they cannot remove them. Keep the list to names a user would actually mean, and do
not use this to validate free text against a large vocabulary of common words.

## Other exports

`ranges(query, index, i)` gives `[start, end)` pairs into the original string, to render the highlight yourself.
`tolerance(length)` is the default edit budget, to reason about a `maxEdits` cap. `normalize(string)` is the
folding, reusable elsewhere. `osa(a, b, tolerance)` is the banded edit distance, mostly for tests.

## Do not

- Rebuild the index per keystroke, or mutate the rows after `createIndex` without rebuilding it.
- Persist or compare `score`: it is only comparable within one index and one query.
- Insert `highlight()` output through anything but HTML: it is escaped for that, not for attributes or JS.
