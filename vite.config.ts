import { defineConfig } from 'vite-plus';

// Workspace-wide: format, lint and type-check rules, the commit hook, and the tasks CI runs.
// Package configs (packages/fzy-search, apps/playground) hold their own build and test settings.
export default defineConfig({
  // Bare `vp dev` / `vp build` / `vp preview` at the root mean the playground; `vp pack` means the library.
  defaultPackage: {
    dev: './apps/playground',
    build: './apps/playground',
    preview: './apps/playground',
    pack: './packages/fzy-search',
  },
  fmt: {
    singleQuote: true,
    printWidth: 120,
    ignorePatterns: ['**/dist/**', 'bench/**', 'docs/plans/**', 'results.md', '**/CHANGELOG.md', 'pnpm-lock.yaml'],
  },
  lint: {
    ignorePatterns: ['**/dist/**', 'bench/**'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      // index.ts preallocates arrays of a known length on the hot path, on purpose.
      'unicorn/no-new-array': 'off',
    },
    options: { typeAware: true, typeCheck: true },
  },
  staged: {
    '*': 'vp check --fix',
  },
  run: {
    cache: true,
    tasks: {
      // Everything a pull request must pass, in one command: `vp run ready`.
      ready: {
        command: 'vp check && vp run -r test && vp run -r build && vp run fzy-search#size && vp run fzy-search#docs',
      },
    },
  },
});
