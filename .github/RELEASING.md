# Releasing

## Day to day

1. Open a pull request. Its title is a Conventional Commit (`feat:`, `fix:`, `perf:`, …): the PR title
   check enforces it, because the title becomes the commit message on squash-merge.
2. CI runs `vp check` (format, lint, type-check), the package build with publint and attw, the size
   budget and the docs drift, the tests on Node 22, 24 and 26, and the packed tarball on Node, Bun and
   Deno. The Preview workflow comments an install command for the branch (pkg.pr.new), the Size workflow
   a comment with the bundle-size delta. `vp run ready` runs the same checks locally.
3. Merge. Nothing else happens: there is no release PR and no bot.
4. To release, run **Actions, Release, Run workflow** on `main` (or `pnpm release` locally). What is
   released is `packages/fzy-search`. The version comes from the commits since the last tag that touch
   the library (git-cliff, `include_paths`: `feat:` minor, `fix:`/`perf:` patch, `feat!:` major); the
   `bump` input overrides it. The job writes `packages/fzy-search/CHANGELOG.md` and the version, commits
   and tags `vx.y.z`, builds, tests, checks the tarball, runs `npm publish --provenance` from the package
   directory, and only then pushes the commit and the tag and creates the GitHub Release. Tick `dry-run`
   first to see the version and the notes without publishing, or run `node scripts/release.mjs notes` on
   any checkout. Never edit the version by hand.

`feat:` is a minor, `fix:` and `perf:` a patch, `feat!:` (or a `BREAKING CHANGE:` footer) a major. Below 1.0 there is no major: a breaking change bumps
the minor, and 1.0.0 is a decision made with the `bump` input once the API has settled.

## One-time setup

These need an account owner, so they are a checklist, not code.

- [ ] **Install the GitHub Apps** on this repository: [pkg-pr-new](https://github.com/apps/pkg-pr-new)
      (previews) and [Renovate](https://github.com/apps/renovate) (dependency updates).
- [ ] **First publish, by hand.** npm only lets you configure trusted publishing for a package that
      exists, so version 0.1.0 (the version in `package.json`) is published once, from `main` after the
      release pull request is merged: `git switch main && git pull && npm login && npm publish --access public`.
      Then tag that commit: `gh release create v0.1.0 --target main --title v0.1.0 --notes "First release"`.
- [ ] **npm, package settings, Trusted Publisher:** GitHub Actions, owner `gabrielstuff`, repository
      `fzy-search`, workflow `release.yml`, environment `npm`.
- [ ] **Optional, recommended:** Settings, Environments, `npm`: add yourself as a required reviewer, so
      a release waits for one click. If branch protection is added later, it must let the release
      actor (`github-actions[bot]`) push to `main`.
- [ ] **Then run the Release workflow** with `dry-run` ticked, and read the version and the notes. Without
      a `v0.1.0` tag git-cliff counts every commit, so tag 0.1.0 first.

Once npm has a trusted publisher, delete any npm token you created for the first publish. There is
no token in this repository, and there should not be one.

## When something goes wrong

- **The publish job fails with an authentication error:** the trusted publisher on npm does not match
  the workflow file name (`release.yml`), the repository, or the environment (`npm`).
- **The workflow says "Nothing to release":** no commit since the last tag changes the version.
- **npm has a version the repository does not:** publish succeeded and the push failed. The log prints
  the command: `git pull --rebase origin main && git push origin HEAD:main vx.y.z` from a clone with the
  release commit, or re-run with `bump` set so it does not collide, then `npm deprecate` the orphan.
- **A bad release:** `npm deprecate fzy-search@x.y.z "reason"` and release a fix. Unpublishing breaks
  everyone who installed it.
