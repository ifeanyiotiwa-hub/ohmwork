# Make a release

`.github/workflows/desktop.yml` builds the installers on GitHub's macOS (both chips), Windows and Linux machines. For a
public repo this is free.

1. Raise the version in `OhmWork/apps/desktop/src-tauri/tauri.conf.json` and `Cargo.toml` (for example to `0.2.0`)
   and commit.
2. Tag and push it: `git tag -a v0.2.0 -m "OhmWork 0.2.0" && git push origin v0.2.0`.
3. About 6 minutes later a draft release with every installer appears under Releases. Check it, add notes, publish.

**Actions → Desktop builds → Run workflow** on a branch builds everything without a release, as a check; its
installers are not kept.

The web app needs no release step: `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to
`develop`.
