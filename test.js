import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndex, search, normalize, osa, tolerance, highlight, ranges } from './index.js';

const NAMES = [
  'Master Sciences de l’éducation parcours Recherche - Université de Lille',
  'BTS Management Commercial Opérationnel - IUT de Cachan',
  'Licence professionnelle Œnologie spécialité Gestion de projet - INSA Lyon',
  'Doctorat Informatique option Cloud et DevOps - IMT Atlantique',
  'CAP Pâtisserie - Lycée Henri-IV',
  'Master Science des données - EM Lyon',
];
const idx = createIndex(NAMES.map((name, id) => ({ id, name })), (x) => x.name);
const top = (q) => search(q, idx, { limit: 1 })[0]?.item.name;
const all = (q) => search(q, idx).map((r) => r.item.name);

test('normalize: accents, ligatures, apostrophes, case', () => {
  assert.equal(normalize('Œnologie').text, 'oenologie');
  assert.equal(normalize('Pâtisserie').text, 'patisserie');
  assert.equal(normalize('l’éducation').text, 'l education');
  assert.equal(normalize('ÉTÉ').text, 'ete');
});

test('normalize: index map points back at the source string', () => {
  const { text, map } = normalize('Œnologie');
  assert.equal(text.slice(0, 2), 'oe');
  assert.equal(map[0], 0);          // both halves of the ligature
  assert.equal(map[1], 0);          // point at the same source char
  assert.equal(map[2], 1);
});

test('osa: counts a transposition as one edit', () => {
  assert.equal(osa('sicences', 'sciences', 2), 1);
  assert.equal(osa('sciences', 'sciences', 2), 0);
  assert.equal(osa('abc', 'abd', 1), 1);
});

test('osa: returns tol+1 instead of the true distance when over budget', () => {
  assert.equal(osa('abcdef', 'zzzzzz', 2), 3);
  assert.equal(osa('short', 'muchlongerword', 2), 3);
});

test('exact query beats prefix beats substring', () => {
  const scores = (q) => search(q, idx)[0].score;
  assert.ok(scores('cap patisserie - lycee henri-iv') === 1000);
  assert.ok(scores('cap patisserie') >= 900);
  assert.ok(scores('patisserie') >= 800);
});

test('transposition typo still finds the row', () => {
  assert.match(top('sicences donnees'), /Science des données|Sciences de l/);
  assert.match(top('manangement commercial'), /Management Commercial/);
});

test('missing accents and apostrophes are transparent', () => {
  assert.match(top('oenologie gestion'), /Œnologie/);
  assert.match(top('sciences de l education'), /Sciences de l’éducation/);
});

test('word order does not matter', () => {
  assert.match(top('commercial management'), /Management Commercial/);
});

test('word prefixes match', () => {
  assert.match(top('doct info cloud'), /Doctorat Informatique/);
});

test('a missing space is recovered', () => {
  assert.match(top('informatiquecloud'), /Doctorat Informatique/);
});

test('every query word must match — no false positives', () => {
  assert.deepEqual(all('patisserie zzzzzz'), []);
  assert.deepEqual(all('quantique'), []);
});

test('short words are matched strictly (no 1-edit slop on 3 letters)', () => {
  assert.deepEqual(all('cop'), []);          // would be "cap" with 1 edit
  assert.ok(all('cap').length > 0);
});

test('the vocabulary prefilter never drops a row the scorer would accept', () => {
  // brute force: score every row directly, compare with search()
  const queries = ['sicences donnes', 'oenolog gestio', 'manag commercial cachan', 'cloud devpos', 'lille recherche'];
  for (const q of queries) {
    const got = new Set(search(q, idx).map((r) => r.i));
    for (let i = 0; i < NAMES.length; i++) {
      const alone = createIndex([{ id: i, name: NAMES[i] }], (x) => x.name);
      if (search(q, alone).length && !got.has(i)) assert.fail(`row ${i} dropped for "${q}"`);
    }
  }
});

test('results are sorted by descending score', () => {
  const r = search('master', idx);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
});

test('limit truncates without changing the ranking', () => {
  const full = search('master', idx).slice(0, 2).map((r) => r.i);
  assert.deepEqual(search('master', idx, { limit: 2 }).map((r) => r.i), full);
});

test('empty and punctuation-only queries return nothing', () => {
  assert.deepEqual(search('', idx), []);
  assert.deepEqual(search('   ', idx), []);
  assert.deepEqual(search('---', idx), []);
});

test('highlight wraps the matched spans in the ORIGINAL string', () => {
  const i = search('oenologie gestion', idx, { limit: 1 })[0].i;
  const html = highlight('oenologie gestion', idx, i);
  assert.ok(html.includes('<mark>Œnologie</mark>'));
  assert.ok(html.includes('<mark>Gestion</mark>'));
  assert.ok(html.includes('spécialité'));                 // untouched text kept, accents intact
});

test('highlight escapes HTML', () => {
  const evil = createIndex([{ name: '<script>Économie & co</script>' }], (x) => x.name);
  const html = highlight('economie', evil, 0);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('highlight ranges are sorted, merged and non-overlapping', () => {
  const i = search('sciences education lille', idx, { limit: 1 })[0].i;
  const rs = ranges('sciences education lille', idx, i);
  for (let k = 1; k < rs.length; k++) assert.ok(rs[k][0] > rs[k - 1][1]);
});

test('index build is idempotent and does not mutate the items', () => {
  const items = [{ name: 'Café' }];
  const a = createIndex(items, (x) => x.name);
  assert.deepEqual(items, [{ name: 'Café' }]);
  assert.equal(a.texts[0], 'cafe');
});

// --- input shapes ---------------------------------------------------------
test('accepts a plain array of strings', () => {
  const i = createIndex(['Master Sciences', 'CAP Pâtisserie']);
  const r = search('patisseri', i, { limit: 1 })[0];
  assert.equal(r.item, 'CAP Pâtisserie');
  assert.equal(r.key, 1);
});

test('accepts an array of objects with a key name', () => {
  const i = createIndex([{ id: 9, label: 'Sciences de l’éducation' }, { id: 4, label: 'Pâtisserie' }], 'label');
  assert.equal(search('sicences', i, { limit: 1 })[0].item.id, 9);
});

test('accepts a dotted key path', () => {
  const i = createIndex([{ meta: { title: 'Licence Œnologie' } }], 'meta.title');
  assert.equal(search('oenolog', i).length, 1);
});

test('accepts an accessor function', () => {
  const i = createIndex([{ a: 'Génie', b: 'civil' }], (x) => `${x.a} ${x.b}`);
  assert.equal(search('genie civ', i).length, 1);
});

test('accepts a plain object, and reports the original key', () => {
  const i = createIndex({ a: 'Doctorat Informatique', b: 'BUT Journalisme' });
  const r = search('informatiq', i, { limit: 1 })[0];
  assert.equal(r.key, 'a');
  assert.equal(r.item, 'Doctorat Informatique');
});

test('accepts an object of objects with a key name', () => {
  const i = createIndex({ x: { n: 'Master Économie' }, y: { n: 'BTS Tourisme' } }, 'n');
  const r = search('economi', i, { limit: 1 })[0];
  assert.equal(r.key, 'x');
  assert.equal(highlight('economi', i, r.i), 'Master <mark>Économi</mark>e');
});

test('missing, null and non-string values do not throw', () => {
  const i = createIndex([{ n: 'Café' }, { n: null }, {}, { n: 42 }], 'n');
  assert.equal(search('cafe', i, { limit: 1 })[0].item.n, 'Café');
  assert.equal(search('42', i, { limit: 1 })[0].item.n, 42);
});

// --- robustness additions ---------------------------------------------------
test('non-Latin queries fall back to substring matching instead of a silent miss', () => {
  // bounds() only knows a-z0-9, so a Cyrillic word is invisible to the index;
  // search() must not answer "no rows" to an exact substring.
  const i = createIndex(['Москва université', 'Kyiv institute']);
  assert.deepEqual(search('москва', i).map((r) => r.item), ['Москва université']);
  assert.equal(search('москв', i).length, 1);            // prefix
  assert.equal(search('universit', i).length, 1);        // Latin part still word-matched
  assert.deepEqual(search('zzzz', i), []);               // and still no false positives
});

test('search tolerates null, undefined and numeric queries', () => {
  const i = createIndex([{ n: 'Café' }, { n: 42 }], 'n');
  assert.deepEqual(search(null, i), []);
  assert.deepEqual(search(undefined, i), []);
  assert.equal(search(42, i, { limit: 1 })[0].item.n, 42);
});

test('limit: 0 returns nothing', () => {
  assert.deepEqual(search('master', idx, { limit: 0 }), []);
});

test('top-N and full sort agree on ties', () => {
  // Three rows with the same score (prefix tier); the insertion-sort top-N and
  // the full sort must return them in the same order.
  const i = createIndex(['Paris 1', 'Paris 2', 'Paris 3', 'Lyon']);
  const full = search('paris', i).map((r) => r.key);
  assert.deepEqual(search('paris', i, { limit: 2 }).map((r) => r.key), full.slice(0, 2));
});

test('osa matches beyond the old 80-char buffer cap', () => {
  const a = 'a'.repeat(100);
  assert.equal(osa(a, 'a'.repeat(99) + 'b', 2), 1);
  const i = createIndex([a]);
  // 1-edit match, reachable by neither the exact, prefix nor infix tiers
  assert.equal(search('a'.repeat(99) + 'b', i).length, 1);
});

test('an ungluable glued word leaks nothing', () => {
  // "informatiqueclou" splits into informatique + clou; clou is not a word,
  // so the whole query must reject rather than match on the good half.
  assert.deepEqual(search('informatiqueclou', idx), []);
});

test('createIndex rejects a non-object source', () => {
  assert.throws(() => createIndex(42, 'x'), TypeError);
  assert.throws(() => createIndex(null), TypeError);
});

// --- search options ----------------------------------------------------------
// Every option must default to the old behaviour, and each one must do exactly
// one thing. The city list is the case that motivated them: a typo check against
// a list of names, where an ordinary word matching a name is the failure mode.
// Big cities only, on purpose. Options cannot tell "renned" (a typo of Rennes) from "commerce" (a word, one
// edit from the small town Commercy): both are 1 edit, same first letter, fully covering. What separates them is
// the list, so a caller that wants typo matching keeps the list to names a user would actually mean.
const CITIES = ['Rennes', 'Avignon', 'Toulouse', 'Clermont-Ferrand', 'Narbonne', 'Besançon', 'Paris'];
const cities = createIndex(CITIES);
const names = (q, opts) => search(q, cities, opts).map((r) => r.item);
const TYPO = { prefix: false, infix: false, maxEdits: 1, minTypoLength: 6, keepInitial: true, minCoverage: 0.8 };

test('options: passing none, or the defaults, changes nothing', () => {
  for (const q of ['sicences donnes', 'cloud', 'lille', 'cap', 'informatiquecloud']) {
    const plain = search(q, idx);
    const explicit = search(q, idx, { prefix: true, infix: true, maxEdits: Infinity, minTypoLength: 0, keepInitial: false, minCoverage: 0, minScore: -Infinity });
    assert.deepEqual(explicit, plain, q);
  }
});

test('tolerance is exported and unchanged', () => {
  assert.deepEqual([3, 4, 7, 8].map(tolerance), [0, 1, 1, 2]);
});

test('prefix: false stops as-you-type matches', () => {
  assert.deepEqual(names('toulou'), ['Toulouse']);
  assert.deepEqual(names('toulou', { prefix: false, infix: false, maxEdits: 0 }), []);
  assert.deepEqual(names('toulouse', { prefix: false, infix: false, maxEdits: 0 }), ['Toulouse']);
});

test('infix: false stops matches inside a word', () => {
  assert.ok(names('ferrand').includes('Clermont-Ferrand'));
  assert.ok(names('arbonn').includes('Narbonne'));
  assert.deepEqual(names('arbonn', { infix: false, prefix: false, maxEdits: 0 }), []);
});

test('maxEdits caps the budget, 0 turns typos off', () => {
  assert.deepEqual(names('toulousx', { prefix: false, infix: false }), ['Toulouse']);   // 1 edit, 8 letters: default budget is 2
  assert.deepEqual(names('toulouxx', { prefix: false, infix: false, maxEdits: 1 }), []); // 2 edits, capped at 1
  assert.deepEqual(names('toulouxx', { prefix: false, infix: false, maxEdits: 2 }), ['Toulouse']);
  assert.deepEqual(names('renned', { prefix: false, infix: false, maxEdits: 0 }), []);
});

test('minTypoLength: short words are never edit-matched', () => {
  assert.deepEqual(names('pariz', { prefix: false, infix: false }), ['Paris']);
  assert.deepEqual(names('pariz', { prefix: false, infix: false, minTypoLength: 6 }), []);
});

test('keepInitial: an edit may not change the first letter', () => {
  assert.deepEqual(names('sennes', { prefix: false, infix: false }), ['Rennes']);
  assert.deepEqual(names('sennes', { prefix: false, infix: false, keepInitial: true }), []);
  assert.deepEqual(names('renned', { prefix: false, infix: false, keepInitial: true }), ['Rennes']);
});

test('minCoverage: the query must account for the row', () => {
  assert.ok(names('ferrandi', { prefix: false, infix: false }).includes('Clermont-Ferrand'));
  assert.deepEqual(names('ferrandi', { prefix: false, infix: false, minCoverage: 0.8 }), []);
  assert.deepEqual(names('renned', { prefix: false, infix: false, minCoverage: 0.8 }), ['Rennes']);
});

test('minScore drops weak rows and keeps the strong ones', () => {
  const weak = search('renned', cities, { prefix: false, infix: false });
  assert.ok(weak.length > 0);
  assert.deepEqual(search('renned', cities, { prefix: false, infix: false, minScore: weak[0].score + 1 }), []);
  assert.equal(search('rennes', cities, { minScore: 1000 })[0].item, 'Rennes');
});

test('the typo preset: real misspellings in, ordinary words out', () => {
  for (const [typo, city] of [['renned', 'Rennes'], ['aivgnon', 'Avignon'], ['toumouse', 'Toulouse'], ['besanconu', 'Besançon']]) {
    assert.deepEqual(names(typo, { ...TYPO, limit: 1 }), [city], typo);
  }
  // each of these is within reach of a real city (Narbonne, Paris, Clermont-Ferrand) and is an ordinary word
  for (const word of ['sorbonne', 'commerce', 'ferrandi', 'histoire', 'parisien']) {
    assert.deepEqual(names(word, TYPO), [], word);
  }
});

test('options reach every word of a multi-word query', () => {
  assert.deepEqual(names('renned avignon', { ...TYPO, minCoverage: 0 }).sort(), []);   // one row must hold all words
  assert.deepEqual(names('clermont ferrand', { ...TYPO, minTypoLength: 0, maxEdits: 0 }), ['Clermont-Ferrand']);
});
