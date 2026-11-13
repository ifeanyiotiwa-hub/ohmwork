# The release pipeline

Two GitHub Actions workflows in `.github/workflows/`. Steps for making a release: [Make a release](../releasing.md).

## 1. The website: every push to `develop`
**Read:** `pages.yml`.
1. One Ubuntu machine installs exact dependency versions (`pnpm install --frozen-lockfile`, so the lockfile is the
   truth).
2. It runs everything: unit tests, type checks and a production build, the browser tests in Chromium, and an offline
   test of the production build.
3. **Only if all of that passes** does it build for the site's address (`--base-href` from Pages, because a project
   site lives under `/ohmwork/`) and upload it.
4. A second job deploys it to GitHub Pages.

Details worth knowing:
- `concurrency: pages` with `cancel-in-progress: false`: a newer push waits instead of cancelling a deploy halfway.
- `permissions` grants only what's needed: read the code, write Pages, and an identity token to prove the deploy came
  from this workflow.
- When a test fails, the Playwright reports are kept for 7 days to debug.

## 2. Installers: a version tag
**Read:** `desktop.yml`.
- Triggered by pushing a tag like `v0.2.0`, or by hand.
- A *matrix* runs four jobs in parallel: macOS for Apple silicon, macOS for Intel, Windows, Linux. Each machine builds
  its own system's installers, because Tauri can't reliably cross-compile them.
- `fail-fast: false`: one failing system doesn't stop the others.
- `tauri-action` builds the app (the Angular web app inside a native window) and attaches the installers to a
  **draft** release. A person checks it and publishes it.
- Caches (pnpm, Rust) make later builds faster.

## 3. Why the apps warn on first open
The installers aren't code-signed. Signing proves who made an app: Apple needs a paid developer account and
notarization, and Windows needs a certificate. Until there are users it was set aside (owner's decision, 2026-11-09),
and the install guide explains how to open them.

## 4. Two places the same version lives
The app version is in `tauri.conf.json` and `Cargo.toml`. Raise both before tagging, or the installer names won't
match the tag.

## Test yourself
<details><summary>Why run the tests again in CI when they pass on your machine?</summary>
CI starts from a clean machine with the locked dependencies, so it catches "works on my machine" problems, and it
stops a broken build from reaching users.
</details>

<details><summary>Why is the release a draft?</summary>
So a person can check that all installers are there and add notes before anyone can download it.
</details>

<details><summary>Why four build machines instead of one?</summary>
Each system's installer needs that system's toolchain and libraries; cross-compiling desktop apps is unreliable. A
Mac builds both Mac chips, but Windows and Linux need their own.
</details>

<details><summary>What does `--frozen-lockfile` prevent?</summary>
Installing different dependency versions than the ones tested: the install fails if the lockfile and package.json
disagree.
</details>

<details><summary>What would you add next to this pipeline?</summary>
Code signing and notarization once accounts exist; running the desktop builds on pull requests; and automatic release
notes from commits.
</details>
