# Changelog
## [0.2.0](https://github.com/gabrielstuff/fzy-search/compare/v0.1.1...v0.2.0) (2026-10-27)

### Features

* **BREAKING** require Node 22 or later ([#13](https://github.com/gabrielstuff/fzy-search/pull/13)) ([fe596c5](https://github.com/gabrielstuff/fzy-search/commit/fe596c5c244a26e6c317552ba0ae3a55f8c4edde))
* **playground:** a live demo built with Vite+, on GitHub Pages ([#15](https://github.com/gabrielstuff/fzy-search/pull/15)) ([f583677](https://github.com/gabrielstuff/fzy-search/commit/f58367774acc84ed756ff9759b05c11045e66f97))

### Bug Fixes

* broken links in llms.txt, a size script that only ran from bench/, stale figures ([#17](https://github.com/gabrielstuff/fzy-search/pull/17)) ([d4cb215](https://github.com/gabrielstuff/fzy-search/commit/d4cb215743605643131ffc2d05705df249909d47))

### Performance Improvements

* memoize query-word resolution, skip edit distance and string tiers for words that cannot pass them, slim the index ([#18](https://github.com/gabrielstuff/fzy-search/pull/18)) ([b5dceb9](https://github.com/gabrielstuff/fzy-search/commit/b5dceb90f611d926612551c8ba13b0ef7681a880))

### Documentation

* add an AI policy, a disclosure box and agent rules ([#12](https://github.com/gabrielstuff/fzy-search/pull/12)) ([d78a9d4](https://github.com/gabrielstuff/fzy-search/commit/d78a9d4c7785fd705e3b3c80dee7b10db3a16e8a))
## [0.1.1](https://github.com/gabrielstuff/fzy-search/compare/v0.1.0...v0.1.1) (2026-10-27)

### Bug Fixes

* spell the repository field as npm publishes it ([#10](https://github.com/gabrielstuff/fzy-search/pull/10)) ([a68346e](https://github.com/gabrielstuff/fzy-search/commit/a68346e044e4d6e3d9aaff03fbb29d28318d8f6d))
## [0.1.0](https://github.com/gabrielstuff/fzy-search/compare/...v0.1.0) (2026-10-27)

### Features

* **search:** options to tighten matching, export tolerance ([0d9ef44](https://github.com/gabrielstuff/fzy-search/commit/0d9ef441d801f6bcbaa94bff9de628397132ba10))

### Documentation

* ship an agent skill, rules for agents, size and docs drift checks, oxlint ([#8](https://github.com/gabrielstuff/fzy-search/pull/8)) ([a673b69](https://github.com/gabrielstuff/fzy-search/commit/a673b695f8313ed4a5de1b5c8ac7b939dff8e227))

