# Changelog

One entry per released mobile app version. This is the quick, in-repo
record of what shipped in each tag — the full build artifacts (APKs) and
build logs for every past release live permanently on GitHub's
[Releases page](https://github.com/sasindumal/AyuLink/releases); this file
is just the human-readable "what changed" summary next to the code.

See [`frontend/mobile/README.md` § Building & releasing
APKs](frontend/mobile/README.md#building--releasing-apks) for how a release
is cut.

## [Unreleased]

- (add bullet points here as you work; move them under a new version
  heading below at the moment you tag, then leave this section empty
  until the next round of changes)

## [v1.0.2] - failed build, superseded by v1.0.3

- Second attempt. Got past the yarn-misdetection issue, but all 4
  jobs failed at `npm ci` (EUSAGE — `package-lock.json` out of sync,
  missing `react-dom`/`scheduler`). Fixed in v1.0.3 by installing with
  `--legacy-peer-deps` in CI, matching the local setup instructions
  already documented in `frontend/mobile/README.md`.

## [v1.0.1] - failed build, superseded by v1.0.2

- Attempted first release. All 4 build jobs failed: EAS CLI's local
  dependency-fingerprinting step misdetected the package manager as
  yarn in this monorepo (no lockfile at the git root) and crashed
  running `yarn install`. Fixed in v1.0.2 by pinning `packageManager`
  in each app's `package.json`.

<!--
Template for a new entry — copy this above the previous version, filling
in the tag and date, right before running `git tag -a vX.Y.Z`:

## [v1.0.0] - 2026-08-27

- First public release: patient, doctor, pharmacy, and channeling-center
  APKs available for direct download from the website.
-->
