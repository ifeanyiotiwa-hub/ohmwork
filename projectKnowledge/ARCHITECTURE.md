# Architecture

## Shape
```
Device (works offline)                     Server (optional, later)
┌────────────────────────────────┐         ┌──────────────────────────┐
│ apps/web (Angular + PixiJS) ─┐ │  HTTPS  │ Spring Boot 4 + MySQL    │
│ apps/mcp (MCP server) ───────┼─┼► engine│ accounts, sharing,       │
│ tests ───────────────────────┘ │ ◄─────► │ lessons, community       │
│ apps/desktop (Tauri 2 wrapper) │         └──────────────────────────┘
└────────────────────────────────┘
```

## Repo layout (`EngineeringCircuit/`, pnpm workspace)
| Path | Purpose | Depends on |
|---|---|---|
| `packages/format` | Circuit JSON format: types, validation, version migrations | none |
| `packages/engine` | Simulation: analog (MNA), digital (event-driven), mixed | `format` |
| `apps/web` | Angular 22 UI (signals, standalone, zoneless), SVG canvas; plain circuits solved in-thread, time-dependent ones in a Web Worker | `format`, `engine`, `editing` |
| `packages/editing` | Shared edit commands (`applyCommand`, validated `editCommandSchema`), `CircuitDocument` (author-tagged history, undo, change subscription) and the live-link protocol (`live-protocol.ts`). Used by the MCP server and the UI | `format` |
| `apps/mcp` | MCP server (TypeScript SDK v2, stdio): build/simulate/explain tools; hosts the live link (WebSocket on 127.0.0.1) that shares its `CircuitDocument` with the app | `format`, `engine`, `editing` |
| `apps/desktop` | Tauri 2 shell around `apps/web` (desktop + mobile) | `apps/web` build |

## Rules (keep these and the project never paints itself into a corner)
1. **The engine knows nothing about the screen.** No DOM, Angular, or PixiJS in `packages/engine`. The UI and the MCP are two clients of the same engine.
2. **The circuit format is the contract.** It's versioned from v1. Old files always load via migrations in `packages/format`.
3. **AI tools call engine and format functions, never UI clicks.**
4. **Engine math is verified by golden circuits.** These are circuits with textbook-known answers, run on every change.
5. **The maths lives in one place.** A future server reuses the TS engine and never reimplements it.
6. Dependencies point one way: `apps/* → packages/engine → packages/format`.
7. **One live circuit, many editors.** The learner (UI) and the AI agent (MCP) edit the same circuit through the same edit commands (add, connect, set parameter, delete). Each command records who made it, so changes can be shown, undone, and explained. Neither side keeps its own copy: while linked, the MCP server's document is the only one (D8, ADR-014).
8. **The engine explains failures.** Problems come back as `{ componentIds, message }` in plain language, never as a bare "singular matrix", so the UI can highlight parts and the AI can teach from them.

## Engine conventions
- Readings use the passive sign convention: a part's `current` flows into its first pin (`a`, `positive`, `anode`) and out of its second; `voltage` = first pin − second pin. Power = voltage × current; negative power means the part is supplying energy (a battery driving a load reads negative current). Same as SPICE.
- Each part type maps to simple branches (resistor, voltage, current) in `DC_MODELS`; that table must list every catalog type, so a new part can't compile until the engine decides how to model it.
- Over time (`stepTransient`), capacitors and inductors are companion models stepped with a fixed time step from rest; see ADR-015. A plain DC solve treats capacitors as open, inductors as wires, and wave sources at their DC value.
- Floating sections are solved relative to a stated reference pin and produce a warning; they are not silently tied to ground with a hidden resistor.

## Live link (D8)
```
Claude Code ──stdio──► apps/mcp: CircuitDocument ◄── MCP tools (author "agent")
                            │ ws://127.0.0.1:<port>  (token + origin checked)
                            ▼
                       apps/web CircuitStore ── edits (author "learner") ──► server
```
- App → server: `edit` (an `EditCommand`), `undo`, `replace`. Server → every app: `state` (revision, whole circuit, history, the change and its author) or `rejected` (why).
- The app validates an edit locally first, shows the predicted result, and replaces it with the server's state when it arrives.
- Selection, zoom, pause stay local to each app.

## Stack
TypeScript (strict) · pnpm workspaces · Vitest · Playwright · Angular 22 (signals, standalone, `inject()`) · SVG canvas · MCP TypeScript SDK · WebSocket live link · Tauri 2 · PWA. Optional later: Rust/WASM or ngspice-WASM behind the engine interface; Spring Boot 4 backend.
