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
| `apps/web` | Angular 21 UI, PixiJS canvas, engine in a Web Worker | `format`, `engine` |
| `apps/mcp` | MCP server (TypeScript SDK): build/simulate/explain tools | `format`, `engine` |
| `apps/desktop` | Tauri 2 shell around `apps/web` (desktop + mobile) | `apps/web` build |

## Rules (keep these and the project never paints itself into a corner)
1. **The engine knows nothing about the screen.** No DOM, Angular, or PixiJS in `packages/engine`. The UI and the MCP are two clients of the same engine.
2. **The circuit format is the contract.** It's versioned from v1. Old files always load via migrations in `packages/format`.
3. **AI tools call engine and format functions, never UI clicks.**
4. **Engine math is verified by golden circuits.** These are circuits with textbook-known answers, run on every change.
5. **The maths lives in one place.** A future server reuses the TS engine and never reimplements it.
6. Dependencies point one way: `apps/* → packages/engine → packages/format`.

## Stack
TypeScript (strict) · pnpm workspaces · Vitest · Playwright · Angular 21 (signals, standalone, `inject()`) · PixiJS · MCP TypeScript SDK · WebSocket live link · Tauri 2 · PWA. Optional later: Rust/WASM or ngspice-WASM behind the engine interface; Spring Boot 4 backend.
