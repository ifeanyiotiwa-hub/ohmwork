# Working with an AI agent

OhmWork includes an MCP server, so an agent such as Claude can build, simulate and explain circuits. It reads the real
circuit (every part, wire, value and live reading, including the engine's plain-language warnings), so its
explanations come from the simulation, not from guessing at a screenshot.

## Connect an agent
- **Claude Code:** the repo root has `.mcp.json`, so Claude Code opened in the repo offers the `ohmwork` server.
  Approve it once.
- **Other MCP clients:** run `pnpm --silent --dir OhmWork/apps/mcp start` from the repo root as a stdio server (first
  set up the project as in [Build from source](build-from-source.md)).

Try: "Build a 9 V battery with two resistors in series, simulate it, and explain where the voltage goes."

## Watch and edit together (live link)
1. Start the app: `pnpm web` in `OhmWork/`.
2. Ask the agent: "Give me the link to open this circuit in the app". Open the link it gives you.
3. The status bar shows "Live with agent". What the agent changes appears and glows briefly; what you change, the
   agent sees. Undo works from either side.

The live link works in the web app, not the desktop app. It only accepts this computer, the app's own address, and
the session token in the link.

## Learn with the tutor
Ask "tutor me through light-an-led", or use the **tutor** prompt. See [Lessons and the tutor](lessons.md).

## Settings
Set these as environment variables for the server.

| Variable | What it does | Default |
|---|---|---|
| `OHMWORK_WORKSPACE_DIR` | The folder the agent opens and saves circuits in; its files stay inside it | where the server started |
| `OHMWORK_HISTORY_LIMIT` | Undo steps kept | 200 |
| `OHMWORK_MAX_FILE_BYTES` | Largest circuit file | 5 MB |
| `OHMWORK_MAX_TRANSIENT_STEPS` | Most steps one `simulate_over_time` call runs | 200000 |
| `OHMWORK_APP_URL` | The app's address, for the live link | `http://localhost:4200` |
| `OHMWORK_LIVE_ORIGINS` | Extra allowed app addresses, comma-separated | none |
| `OHMWORK_LIVE_PORT` | The live link's port | any free port |
| `OHMWORK_LIVE_TOKEN` | The live link's token, at least 16 characters | a new random token each start |

Set the port and the token so the app reconnects by itself after the agent restarts. Keep the token secret.
