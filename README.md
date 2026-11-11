# OhmWork

A free, open-source circuit simulator for learning electronics and building things. Place parts, wire them up and
watch the current flow; follow lessons; or let an AI agent build and explain circuits with you.

- **Use it in the browser:** https://ifeanyiotiwa-hub.github.io/ohmwork/ (it can be installed as an app and then
  works offline, on iPhone and iPad too).
- **Desktop app** for macOS, Windows and Linux: see [Install](#install).
- **Licence:** GPL-2.0-or-later (some of the simulation maths is ported from CircuitJS1).

## Install
Download the installer for your system from the
[latest release](https://github.com/ifeanyiotiwa-hub/ohmwork/releases/latest):

| System | File |
|---|---|
| macOS, Apple silicon (M1 and later) | `OhmWork_<version>_aarch64.dmg` |
| macOS, Intel | `OhmWork_<version>_x64.dmg` |
| Windows | `OhmWork_<version>_x64-setup.exe` (or the `.msi`) |
| Linux, Debian or Ubuntu | `OhmWork_<version>_amd64.deb` |
| Linux, Fedora or openSUSE | `OhmWork-<version>-1.x86_64.rpm` |
| Linux, any distribution | `OhmWork_<version>_amd64.AppImage` |

The apps are not code-signed yet, so each system warns the first time you open one:

- **macOS:** open the `.dmg` and drag OhmWork to Applications. Opening it says Apple could not check it: click
  **Done**, then in **System Settings → Privacy & Security** click **Open Anyway** next to the OhmWork message. If
  macOS says the app "is damaged", run `xattr -cr /Applications/OhmWork.app` in Terminal once, then open it again.
- **Windows:** SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**.
- **Linux:** `sudo apt install ./OhmWork_<version>_amd64.deb`, `sudo dnf install ./OhmWork-<version>-1.x86_64.rpm`, or
  `chmod +x OhmWork_<version>_amd64.AppImage` and run it.

## Build it yourself
Everything lives in [`OhmWork/`](OhmWork/); run the commands below from there.

### Every system
- Node.js 24 and pnpm 12: install Node from https://nodejs.org, then `npm install -g pnpm@12`.
- `pnpm install`, then `pnpm web` runs the web app at http://localhost:4200.

The desktop app also needs Rust and a few system libraries (the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)):

### macOS
```
xcode-select --install                                           # Apple's command line tools
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # Rust (or: brew install rustup && rustup default stable)
```
Homebrew's rustup is keg-only: add `/opt/homebrew/opt/rustup/bin` to your `PATH`.

### Windows
1. [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/): choose **Desktop
   development with C++**.
2. WebView2: already part of Windows 10 (1803 and later) and 11.
3. Rust from https://rustup.rs (the default MSVC toolchain).

### Linux (Debian or Ubuntu)
```
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
Other distributions: the package names for Fedora, Arch, openSUSE and others are in the Tauri prerequisites.

### Then, on any system
```
pnpm desktop        # the desktop window, with the web app reloading as you edit
pnpm desktop:build  # installers for this system, in apps/desktop/src-tauri/target/release/bundle
```
Each system builds only its own installers; GitHub Actions builds all of them for a release
(`.github/workflows/desktop.yml`, on a `v*` tag).

More for developers (the AI agent server, the live link, Android, tests): [`OhmWork/README.md`](OhmWork/README.md).
Design notes and decisions: [`projectKnowledge/`](projectKnowledge/).
