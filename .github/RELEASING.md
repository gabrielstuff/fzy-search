# Releasing

## Day to day

1. Open a pull request. Its title is a Conventional Commit (`feat:`, `fix:`, `perf:`, …): the PR title
   check enforces it, because the title becomes the commit message on squash-merge.
2. CI runs the suite on Node 18 to 24, the smoke test on Node 14 and 16, publint, the size budget and
   `npm pack`. The Preview workflow comments an install command for the branch (pkg.pr.new).
3. Merge. `release-please` opens or updates a `chore: release x.y.z` pull request with the version bump
   and the `CHANGELOG.md` entries written from the commit messages since the last release.
4. Merge that pull request when you want to release. It tags `vx.y.z`, then the `publish` job tests the
   tag and runs `npm publish --provenance`. Nothing else is needed; never edit the version by hand.

`feat:` is a minor, `fix:` and `perf:` a patch, `feat!:` (or a `BREAKING CHANGE:` footer) a major.

## One-time setup

These need an account owner, so they are a checklist, not code.

- [ ] **Install the GitHub Apps** on this repository: [pkg-pr-new](https://github.com/apps/pkg-pr-new)
      (previews) and [Renovate](https://github.com/apps/renovate) (dependency updates).
- [ ] **Settings, Actions, General:** tick "Allow GitHub Actions to create and approve pull requests"
      (release-please opens the release PR).
- [ ] **First publish, by hand.** npm only lets you configure trusted publishing for a package that
      exists, so version 1.0.0 is published once from the commit that is 1.0.0:
      `git checkout bebaf37 && npm login && npm publish --access public`, then
      `git switch main`. Then tag it: `gh release create v1.0.0 --target bebaf37 --title v1.0.0 --notes "First release"`.
- [ ] **npm, package settings, Trusted Publisher:** GitHub Actions, owner `gabrielstuff`, repository
      `fzy-search`, workflow `release.yml`, environment `npm`.
- [ ] **Optional, recommended:** Settings, Environments, `npm`: add yourself as a required reviewer, so
      a release waits for one click. Add a `RELEASE_PLEASE_TOKEN` secret (fine-grained PAT or GitHub App
      token with contents and pull-requests write) to get CI checks on the release PR; without it the
      release PR still merges, it just shows no checks.
- [ ] **Then merge the release pull request** release-please opens: it releases 1.1.0, the first
      version with the search options.

Once npm has a trusted publisher, delete any npm token you created for the first publish. There is
no token in this repository, and there should not be one.

## When something goes wrong

- **The publish job fails with an authentication error:** the trusted publisher on npm does not match
  the workflow file name (`release.yml`), the repository, or the environment (`npm`).
- **No release PR appears:** nothing releasable has been merged since the last release (only `chore:`,
  `ci:`, `docs:` commits do not trigger one), or the Actions permission above is not ticked.
- **A bad release:** `npm deprecate fzy-search@x.y.z "reason"` and release a fix. Unpublishing breaks
  everyone who installed it.
