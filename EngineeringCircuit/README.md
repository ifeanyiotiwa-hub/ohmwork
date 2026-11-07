# EngineeringCircuit

Free, open-source circuit simulator for learning and creative building: web, desktop, and mobile, with an MCP server for AI agents.

Project docs: `../projectKnowledge/`. License: GPL-2.0-or-later.

## Use it with an AI agent (MCP)
The repo root has `.mcp.json`, so Claude Code opened in `circuitProject/` offers the `engineering-circuit` server (approve it once). Other MCP clients: run `pnpm --silent --dir EngineeringCircuit/apps/mcp start` as a stdio server.

Try: "Build a 9 V battery with two resistors in series, simulate it, and explain where the voltage goes."

### Watch and edit together (live link)
1. Start the app: `pnpm web`.
2. Ask the agent: "Give me the link to open this circuit in the app" (it calls `open_in_app`). Open the link.
3. The status bar shows "Live with agent". What the agent changes appears and glows briefly; what you change, the agent sees (`recent_changes`, `simulate`). Undo works from either side.

The link only accepts this computer, the app's own address and the session token in the link. Settings: `EC_APP_URL` (default `http://localhost:4200`), `EC_LIVE_ORIGINS` (extra allowed app addresses, comma-separated), `EC_LIVE_PORT` (default: any free port).

## Run the app
```
pnpm install
pnpm web            # http://localhost:4200
```
Checks: `pnpm typecheck` (types + production build), `pnpm test` (all unit tests), `pnpm test:e2e` (browser tests; first run `npx playwright install chromium` in `apps/web`).
