import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

const library = JSON.parse(readFileSync(new URL('../../packages/fzy-search/package.json', import.meta.url), 'utf8'));
const source = fileURLToPath(new URL('../../packages/fzy-search/src/index.ts', import.meta.url));

export default defineConfig({
  // GitHub Pages serves the site under /fzy-search/; `vp dev` serves it there too.
  base: '/fzy-search/',
  plugins: [
    {
      // `vp dev` imports the library's TypeScript source, so an edit to src/index.ts reloads the page at
      // once. `vp build` resolves `fzy-search` normally, to the dist/ that npm ships: the published site
      // runs exactly the bytes users install.
      name: 'fzy-search-source-in-dev',
      apply: 'serve',
      config: () => ({ resolve: { alias: { 'fzy-search': source } } }),
    },
  ],
  define: {
    __FZY_VERSION__: JSON.stringify(library.version),
    __FZY_SIZE__: JSON.stringify(/(\d+\.\d) kB/.exec(library.description)?.[1] ?? ''),
  },
  build: {
    target: 'es2022',
  },
  run: {
    tasks: {
      // The site is built against the package build, never against stale files.
      build: { command: 'vp build', dependsOn: ['fzy-search#build'] },
    },
  },
});
