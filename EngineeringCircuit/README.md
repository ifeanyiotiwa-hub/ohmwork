# EngineeringCircuit

Free, open-source circuit simulator for learning and creative building: web, desktop, and mobile, with an MCP server for AI agents.

Project docs: `../projectKnowledge/`. License: GPL-2.0-or-later.

## Use it with an AI agent (MCP)
The repo root has `.mcp.json`, so Claude Code opened in `circuitProject/` offers the `engineering-circuit` server (approve it once). Other MCP clients: run `pnpm --silent --dir EngineeringCircuit/apps/mcp start` as a stdio server.

Try: "Build a 9 V battery with two resistors in series, simulate it, and explain where the voltage goes."

## Run the app
```
pnpm install
pnpm web            # http://localhost:4200
```
Checks: `pnpm typecheck` (types + production build), `pnpm test` (all unit tests), `pnpm test:e2e` (browser tests; first run `npx playwright install chromium` in `apps/web`).
