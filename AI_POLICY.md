# AI policy

AI tools are welcome here, for people and for coding agents. This library is small on purpose and its
scoring is full of judgment calls, so the rule that matters is the one a good tool cannot follow for you:
**keep your taste and your judgment.** Do not be a relay between a model and this repository.

## What we ask

- **Understand what you send.** You should be able to explain every line of your change, why it is the
  smallest one that does the job, and what you ran to check it. "The model wrote it" is not an answer to a
  review comment.
- **Decide, do not forward.** If a model proposes three options, you pick one and say why. A change whose
  author has no opinion about it is a change nobody owns.
- **Say so.** If AI wrote a meaningful part of the change or of its description, tick the box in the pull
  request template. Typing aids, formatting and spell-checking do not count. The point is not suspicion: it
  tells the reviewer where to look harder.
- **Check it yourself.** Run the checks in [AGENTS.md](AGENTS.md). For anything that touches `search()`,
  `vocabHits()` or `wordScore()`, run the benchmark: the unit tests cannot see a hot-path regression.
  Do not paste benchmark numbers, test output or claims you did not produce.
- **Write the description in your own words.** Long, dense, confident summaries are the most common failure
  of generated text. Two honest sentences beat a page.

## Automated pull requests

An agent may open a pull request. A human must read it, in full, before it is marked ready for review, and
the human is its author for every purpose above. A pull request nobody has read is closed without review.
Opening many automated pull requests in a short time is spam, whatever their quality.

## Agents do not release

An agent never starts a release: no `npm run release`, no Release workflow run, no tag, no `npm publish`,
and it does not change `version` or `CHANGELOG.md`. Releases are a maintainer's decision. An agent also does
not raise the size budget or change a score constant on its own: both are decisions made in a pull request,
by a person, with the reason written down.

## Maintainers

We may ask you to explain a change, to redo it by hand, or to close it. We try to say why.

This policy is short on purpose. If you are unsure whether something is fine, ask in the pull request.
