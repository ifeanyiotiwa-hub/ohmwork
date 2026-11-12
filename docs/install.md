# Install

## In the browser (any device)
Open https://ifeanyiotiwa-hub.github.io/ohmwork/. To keep it as an app that works offline, use the browser's install
button (Chrome, Edge) or **Share → Add to Home Screen** (Safari on iPhone and iPad).

## Desktop app
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

## Opening it the first time
The apps are not code-signed yet, so each system warns you once:

- **macOS:** open the `.dmg` and drag OhmWork to Applications. Opening it says Apple could not check it: click
  **Done**, then in **System Settings → Privacy & Security** click **Open Anyway** next to the OhmWork message. If
  macOS says the app "is damaged", run `xattr -cr /Applications/OhmWork.app` in Terminal once, then open it again.
- **Windows:** SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**.
- **Linux:** `sudo apt install ./OhmWork_<version>_amd64.deb`, `sudo dnf install ./OhmWork-<version>-1.x86_64.rpm`, or
  `chmod +x OhmWork_<version>_amd64.AppImage` and run it.

## Known limits
- There is no Android or iPhone store app yet; install the web app on phones instead.
- The desktop app can't join an AI agent's live session; use the web app for that.
- The interface is in English only.
