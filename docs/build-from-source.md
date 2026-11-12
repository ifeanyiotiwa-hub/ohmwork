# Build from source

Everything lives in [`OhmWork/`](../OhmWork/); run the commands below from there.

## The web app (every system)
- Node.js 24 and pnpm 12: install Node from https://nodejs.org, then `npm install -g pnpm@12`.
- `pnpm install`, then `pnpm web` runs the web app at http://localhost:4200, reloading as you edit. Ctrl+C stops it.
- On a phone on the same Wi-Fi: `pnpm --filter @ohmwork/web start --host 0.0.0.0`, then open
  `http://<this computer's IP>:4200` on the phone.
- The production build is the only one that works offline (the service worker is off while developing):
  `pnpm --filter @ohmwork/web build`, then `npx http-server apps/web/dist/web/browser -p 8080` and open
  http://localhost:8080.

## The desktop app
It also needs Rust and a few system libraries (the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

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
pnpm install
pnpm desktop        # the desktop window, with the web app reloading as you edit
pnpm desktop:build  # installers for this system, in apps/desktop/src-tauri/target/release/bundle
```
Each system builds only its own installers (Tauri can't reliably build Windows or Linux installers on a Mac):

| Built on | You get |
|---|---|
| macOS | `.dmg` and `.app` for that Mac's chip |
| Windows | `-setup.exe` and `.msi` |
| Linux | `.deb`, `.rpm` and `.AppImage` |

Both Mac versions from one Mac:
```
rustup target add x86_64-apple-darwin                # once (on an Intel Mac: aarch64-apple-darwin)
pnpm desktop:build --target x86_64-apple-darwin      # into target/x86_64-apple-darwin/release/bundle
```
A virtual machine (UTM, Parallels) on an Apple silicon Mac runs ARM Windows and Linux, so it builds ARM installers,
not the x64 ones most PCs need. To build every system's installers, see [Make a release](releasing.md).

## Android
Also needs the Android SDK with NDK 30 (`sdkmanager "ndk;30.0.16248370"`),
`rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`, and
`ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME` (JDK 17) set.
```
pnpm android        # on a running emulator or a connected phone
pnpm android:build  # APKs in apps/desktop/src-tauri/gen/android/app/build/outputs/apk
```

## Checks
- `pnpm typecheck`: types and the production build.
- `pnpm test`: every unit test (`pnpm test:core` for the packages and the MCP server only).
- `pnpm test:e2e`: the browser tests. Run `npx playwright install chromium` in `apps/web` first.
