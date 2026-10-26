## What and why

<!-- The title is the changelog entry: `feat: …`, `fix: …`, `perf: …`. A breaking change is `feat!: …`. -->

## Checked

- [ ] `npm test`, `npm run test:smoke`, `npm run check:package` and `npm run check:size` pass
- [ ] A new option or behaviour has a test, and the defaults are unchanged (or this is marked breaking)
- [ ] If `search()`, `vocabHits()` or `wordScore()` changed: bench before and after (see AGENTS.md), numbers below
- [ ] If the gzipped size grew: the budget in `scripts/size.mjs`, the readme and `package.json` say the same thing

<!-- Every PR from this repository gets a preview build: the install command is in a comment below. -->
