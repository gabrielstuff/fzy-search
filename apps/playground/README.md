# playground

The live demo of fzy-search: <https://gabrielstuff.github.io/fzy-search/>.

Vanilla TypeScript, no framework, about 11 kB gzipped with the library and the corpus generator. Every keystroke
searches the whole list and the page prints how long it took. The lists are 5 000 to 100 000 generated French
formations (`bench/corpus.js`, the benchmark corpus) and the 34 969 French communes, fetched from geo.api.gouv.fr.
The state lives in the URL hash, so a search is a link.

```sh
vp dev                       # from the repository root: http://localhost:5173/fzy-search/
vp run playground#build      # builds fzy-search first, then the site into dist/
```

`vp dev` aliases `fzy-search` to the library's TypeScript source, so editing `packages/fzy-search/src/index.ts`
reloads the page. `vp build` resolves the package normally, to the `dist/` npm ships: the published page runs the
bytes users install.
