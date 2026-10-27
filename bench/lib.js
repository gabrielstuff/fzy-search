// The fzy-search build under test. By default, what ships: packages/fzy-search/dist (run
// `vp run fzy-search#build` first). Point FZY_LIB at another copy to compare two builds on
// the same harness, for example the previous release:
//
//   FZY_LIB=/tmp/fzy-main/index.js ONLY=fzy node --expose-gc bench/run.js synthetic
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const LIB_PATH = process.env.FZY_LIB ?? fileURLToPath(new URL('../packages/fzy-search/dist/index.js', import.meta.url));
if (!existsSync(LIB_PATH)) throw new Error(`${LIB_PATH} does not exist: run \`vp run fzy-search#build\` first, or set FZY_LIB.`);

export const { createIndex, search, highlight, ranges, normalize } = await import(pathToFileURL(LIB_PATH).href);
