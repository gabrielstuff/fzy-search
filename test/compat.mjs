// A dependency-free compat test, for the Node versions test.js cannot run on.
//
// test.js uses `node:test`, which needs Node 18. The package promises `engines.node >=14`, and a
// promise nobody runs is not one. CI runs this file on the oldest supported Node (and on every
// newer one), so a syntax or built-in that raises the floor fails here, not in a user's bundler.
//
// Keep it to what Node 14 has: `assert` (no `node:` prefix), no top-level await, no `.at()`,
// no `??=`. It checks the behaviour that matters, not every branch: test.js does that.
import assert from 'assert';
import { createIndex, search, highlight, ranges, normalize, osa, tolerance } from '../index.js';

const NAMES = [
  'Master Sciences de l’éducation parcours Recherche - Université de Lille',
  'BTS Management Commercial Opérationnel - IUT de Cachan',
  'Licence professionnelle Œnologie spécialité Gestion de projet - INSA Lyon',
  'Doctorat Informatique option Cloud et DevOps - IMT Atlantique',
  'Master Science des données - EM Lyon',
];
const index = createIndex(NAMES);
const top = (query, opts) => { const hit = search(query, index, { limit: 1, ...opts })[0]; return hit && hit.item; };

// the folding the library is built around
assert.strictEqual(normalize('Œnologie').text, 'oenologie');
assert.strictEqual(top('oenologie'), NAMES[2]);
assert.strictEqual(top('education'), NAMES[0]);

// matching: typo, transposition, prefix, word order, every word must land
assert.strictEqual(top('sicences donnes'), NAMES[4]);
assert.strictEqual(top('manag'), NAMES[1]);
assert.strictEqual(top('lyon science'), NAMES[4]);
assert.deepStrictEqual(search('patisserie zzzzzz', index), []);
assert.deepStrictEqual(search('cop', createIndex(['cap'])), []); // 3 letters: no edit forgiven

// results: sorted, limited, with the row id highlight() needs
const all = search('master', index);
assert.strictEqual(all.length, 2);
assert.ok(all[0].score >= all[1].score);
assert.strictEqual(search('master', index, { limit: 1 }).length, 1);

// the options added in 1.1: defaults are a no-op, each one does one thing
assert.deepStrictEqual(search('sicences', index, {}), search('sicences', index));
assert.deepStrictEqual(search('manag', index, { prefix: false, maxEdits: 0 }), []);
assert.strictEqual(typeof tolerance, 'function');
assert.strictEqual([3, 4, 7, 8].map(tolerance).join(), '0,1,1,2');
const cities = createIndex(['Rennes', 'Clermont-Ferrand']);
const typo = { prefix: false, infix: false, maxEdits: 1, minTypoLength: 6, keepInitial: true, minCoverage: 0.8 };
assert.strictEqual(search('renned', cities, typo)[0].item, 'Rennes');
assert.deepStrictEqual(search('ferrandi', cities, typo), []);

// edit distance and highlighting
assert.strictEqual(osa('sicences', 'sciences', 2), 1);
const hit = search('science', index)[0];
assert.ok(ranges('science', index, hit.i).length > 0);
assert.ok(highlight('science', index, hit.i).includes('<mark>'));
assert.ok(!highlight('<b>', createIndex(['a <b> c']), 0).includes('<b>'));

console.log(`compat ok on node ${process.version}`);
