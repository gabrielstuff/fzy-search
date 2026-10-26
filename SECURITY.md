# Security policy

## Reporting a vulnerability

Please report it privately: [open a security advisory](https://github.com/gabrielstuff/fzy-search/security/advisories/new)
on this repository. Do not open a public issue for it. You will get an answer within a few days.

## Scope

`fzy-search` is a single file with no dependencies and no I/O: it takes strings and returns rows. The
cases worth reporting are a regular expression with catastrophic backtracking on crafted input, an
input that makes `search()` or `createIndex()` run for an unbounded time or exhaust memory, and
`highlight()` returning markup that is not escaped.

## Supported versions

The latest release. Fixes are not backported.

## How the package is built and published

Releases are published from GitHub Actions with npm trusted publishing: no npm token exists, and each
version carries a provenance attestation linking it to the commit and workflow that built it. Workflow
actions are pinned to commit SHAs, and dependencies are installed from a lockfile with install scripts off.
