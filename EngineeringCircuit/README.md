# EngineeringCircuit

Free, open-source circuit simulator for learning and creative building: web, desktop, and mobile, with an MCP server for AI agents.

Project docs: `../projectKnowledge/`. License: GPL-2.0-or-later.

## Use it with an AI agent (MCP)
The repo root has `.mcp.json`, so Claude Code opened in `circuitProject/` offers the `engineering-circuit` server (approve it once). Other MCP clients: run `pnpm --silent --dir EngineeringCircuit/apps/mcp start` as a stdio server.

Try: "Build a 9 V battery with two resistors in series, simulate it, and explain where the voltage goes."

### Learn with a tutor
Ask the agent "tutor me through light-an-led" (or use the MCP prompt **tutor**). It starts the lesson, lets you build in the app (open the live link below), gives one hint at a time, and checks your circuit with `check_solution`. In the app alone: **Lessons** → Start → build → **Check my circuit**.

### Watch and edit together (live link)
1. Start the app: `pnpm web`.
2. Ask the agent: "Give me the link to open this circuit in the app" (it calls `open_in_app`). Open the link.
3. The status bar shows "Live with agent". What the agent changes appears and glows briefly; what you change, the agent sees (`recent_changes`, `simulate`). Undo works from either side.

The link only accepts this computer, the app's own address and the session token in the link. Settings: `EC_APP_URL` (default `http://localhost:4200`), `EC_LIVE_ORIGINS` (extra allowed app addresses, comma-separated), `EC_LIVE_PORT` (default: any free port), `EC_LIVE_TOKEN` (default: a new random token each start; at least 16 characters if set). Set the port and the token so the app reconnects by itself after Claude Code restarts; keep the token secret.

## Run the app
```
pnpm install
pnpm web            # http://localhost:4200
```
In the app: **Library** (or Ctrl/⌘+S) saves circuits in your browser and opens or saves `.circuit.json` files (in Chrome, Edge and the desktop app, "Save to <file>" writes the opened file again in place; other browsers download); the circuit you are editing is kept across reloads. A production build is an installable app that works offline.

Editing: click a wire while wiring to join it in the middle; Shift-click or Shift-drag to select several parts; Ctrl/⌘ + A, C, V, Z select all, copy, paste and undo; **Library** → Picture (SVG or PNG) saves an image of the circuit.

## Desktop app (macOS, Windows, Linux)
Needs Rust (`brew install rustup && rustup default stable`; Homebrew's rustup needs `/opt/homebrew/opt/rustup/bin` on your `PATH`) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
```
pnpm desktop        # the desktop window, with the web app reloading as you edit
pnpm desktop:build  # installers in apps/desktop/src-tauri/target/release/bundle
```
Windows and Linux installers are built by GitHub Actions (`.github/workflows/desktop.yml`) on a `v*` tag or by hand.

Checks: `pnpm typecheck` (types + production build), `pnpm test` (all unit tests), `pnpm test:e2e` (browser tests; first run `npx playwright install chromium` in `apps/web`).
