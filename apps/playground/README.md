# playground

The live demo of fzy-search: <https://gabrielstuff.github.io/fzy-search/>.

Vanilla TypeScript, no framework. Every keystroke searches the whole list and the page prints how long it took.
The lists are the ones other fuzzy search libraries are judged on, fetched at a pinned commit through jsDelivr,
never copied into this repository:

- uFuzzy's comparison corpus (`demos/testdata.json`, MIT): 161,844 strings that its demo races about 25 libraries on,
  fzy.js and Fuse.js among them. It is offered whole, with uFuzzy's benchmark terms as examples, and list by list:
  Steam games, English words, Magic and Hearthstone cards, Unreal Engine 4 files, Prometheus metric names.
- The Fuse.js sample books (`test/fixtures/books.json`, Apache-2.0), the list of its live demo.
- The 34,969 French communes from geo.api.gouv.fr, for accents.

The state lives in the URL hash, so a search is a link.

```sh
vp dev                       # from the repository root: http://localhost:5173/fzy-search/
vp run playground#build      # builds fzy-search first, then the site into dist/
```

`vp dev` aliases `fzy-search` to the library's TypeScript source, so editing `packages/fzy-search/src/index.ts`
reloads the page. `vp build` resolves the package normally, to the `dist/` npm ships: the published page runs the
bytes users install.
