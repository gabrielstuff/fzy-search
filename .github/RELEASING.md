# Releasing

## Day to day

1. Open a pull request. Its title is a Conventional Commit (`feat:`, `fix:`, `perf:`, …): the PR title
   check enforces it, because the title becomes the commit message on squash-merge.
2. CI runs the suite on Node 18 to 24, the compat test on Node 14 and 16, publint, the size budget and
   `npm pack`. The Preview workflow comments an install command for the branch (pkg.pr.new).
3. Merge. Nothing else happens: there is no release PR and no bot.
4. To release, run **Actions, Release, Run workflow** on `main` (or `npm run release` locally). The
   version comes from the commits since the last tag (git-cliff: `feat:` minor, `fix:`/`perf:` patch,
   `feat!:` major); the `bump` input overrides it. The job commits `CHANGELOG.md` and the version,
   tags `vx.y.z`, runs the tests, `npm publish --provenance`, and only then pushes the commit and the
   tag and creates the GitHub Release. Tick `dry-run` first to see the version and the notes without
   publishing. Never edit the version by hand.

`feat:` is a minor, `fix:` and `perf:` a patch, `feat!:` (or a `BREAKING CHANGE:` footer) a major.

## One-time setup

These need an account owner, so they are a checklist, not code.

- [ ] **Install the GitHub Apps** on this repository: [pkg-pr-new](https://github.com/apps/pkg-pr-new)
      (previews) and [Renovate](https://github.com/apps/renovate) (dependency updates).
- [ ] **First publish, by hand.** npm only lets you configure trusted publishing for a package that
      exists, so version 1.0.0 is published once from the commit that is 1.0.0:
      `git checkout bebaf37 && npm login && npm publish --access public`, then
      `git switch main`. Then tag it: `gh release create v1.0.0 --target bebaf37 --title v1.0.0 --notes "First release"`.
- [ ] **npm, package settings, Trusted Publisher:** GitHub Actions, owner `gabrielstuff`, repository
      `fzy-search`, workflow `release.yml`, environment `npm`.
- [ ] **Optional, recommended:** Settings, Environments, `npm`: add yourself as a required reviewer, so
      a release waits for one click. If branch protection is added later, it must let the release
      actor (`github-actions[bot]`) push to `main`.
- [ ] **Then run the Release workflow.** After 1.0.0 is tagged it releases 1.1.0, the first version with
      the search options. Without a `v1.0.0` tag git-cliff counts every commit, so tag 1.0.0 first.

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
