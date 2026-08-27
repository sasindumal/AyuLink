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

## [v1.0.5] / [v1.0.6] - cancelled, superseded by v1.0.7

- Both tags were pushed pointing at the same commit (the
  `.npmrc`/Node-pin fix from v1.0.4's failure) and ended up running
  as duplicate builds simultaneously. `v1.0.5` was cancelled once
  noticed; both jobs actually got past dependency install and into
  the real EAS cloud build step this time (the fix worked), but
  `v1.0.6` was manually cancelled before finishing, so no APKs were
  produced. Also identified in this window: `app.json`'s version was
  static at Expo's scaffolded default (`0.1.0`) regardless of which
  tag triggered the build — fixed for v1.0.7 onward by writing the
  tag's version into `app.json` before building.

## [v1.0.4] - failed build, superseded by v1.0.5

- Fourth attempt. Reached EAS's actual remote build server this time,
  which failed at its own internal `npm ci --include=dev` — the same
  lockfile/peer-dep issue as v1.0.2, but this time on Expo's
  infrastructure, which doesn't see the GitHub Actions runner's
  `--legacy-peer-deps` flag at all. Also surfaced an `EBADENGINE`
  warning: `@supabase/*` now requires Node >=22, EAS's build image was
  on 20.19.4. Fixed in v1.0.5 with a per-app `.npmrc`
  (`legacy-peer-deps=true`, so *any* npm ci anywhere honors it
  automatically) and pinning `node: "22.11.0"` in each `eas.json`.

## [v1.0.3] - failed build, superseded by v1.0.4

- Third attempt. Got past `npm ci` this time and reached the real
  `eas build` step, which then failed immediately: `--output` is a
  local-build-only flag (`eas build --local`'s artifact path), invalid
  on a normal cloud build. Fixed in v1.0.4 by redirecting stdout
  (`> build-result.json`) instead of passing `--output`.

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
