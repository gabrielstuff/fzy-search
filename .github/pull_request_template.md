## What and why

<!-- The title is the changelog entry: `feat: …`, `fix: …`, `perf: …`. A breaking change is `feat!: …`. -->

## Checked

- [ ] `npm test`, `npm run check:package` and `npm run check:size` pass
- [ ] A new option or behaviour has a test, and the defaults are unchanged (or this is marked breaking)
- [ ] If `search()`, `vocabHits()` or `wordScore()` changed: bench before and after (see AGENTS.md), numbers below
- [ ] If the gzipped size grew: the budget in `scripts/size.mjs`, the readme and `package.json` say the same thing
- [ ] AI wrote a meaningful part of this change or its description, and I have read all of it and can explain it ([AI_POLICY.md](../AI_POLICY.md)). Leave unchecked if not.

<!-- Every PR from this repository gets a preview build: the install command is in a comment below. -->
