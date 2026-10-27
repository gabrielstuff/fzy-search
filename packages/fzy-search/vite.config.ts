import { defineConfig } from 'vite-plus';

export default defineConfig({
  // `vp pack`: one ES2020 module and its declarations, nothing else. The source may use any
  // TypeScript; what ships is plain ES2020, because it goes to browsers and bundlers as is.
  pack: {
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    dts: { generator: 'tsgo' },
    exports: true,
    // Fail the build, not a later CI job, when the package is wrongly shaped.
    publint: true,
    attw: { profile: 'esm-only' },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
  run: {
    tasks: {
      // Cached: a second `vp run build` with no source change replays in milliseconds.
      build: 'vp pack',
      test: 'vp test',
      // The gzipped cost of what ships, against the budget and the figures the docs quote.
      size: { command: 'node ../../scripts/size.mjs', dependsOn: ['build'] },
      // Every option and export of dist/index.d.ts is in the readme, llms.txt and the skill.
      docs: { command: 'node ../../scripts/check-docs.mjs', dependsOn: ['build'] },
      // Pack the tarball, install it in an empty project, use it on Node, Bun and Deno.
      tarball: { command: 'node ../../scripts/test-tarball.mjs', dependsOn: ['build'], cache: false },
    },
  },
});
