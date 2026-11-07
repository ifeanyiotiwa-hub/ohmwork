# Handover

## Current state
- D0 done: folders, docs, git, pnpm workspace, strict TS 7, Vitest 5.
- D1 done: `EngineeringCircuit/packages/format` (`@engineering-circuit/format`, zod 4).
  - `src/schema/components/`: one file per category (`sources`, `passives`, `switches`, `semiconductors`) of `defineComponent(type, { pins, params })` entries. `catalog.ts` combines them into `COMPONENT_DEFINITIONS`, `componentSchema`, `Component`, `ComponentType`, `pinsOf`, `isComponentType`. Adding a part = one entry (see `COMPONENTS.md`).
  - `src/schema/geometry.ts`: `pointSchema`, `rotationSchema`.
  - `src/schema/circuit.ts`: `Circuit`, `Wire`, `PinRef`, `createCircuit`, `FORMAT_ID`, `CURRENT_VERSION = 1`.
  - `src/io/parse.ts`: `parseCircuit` / `parseCircuitJson` return `{ ok, circuit } | { ok: false, errors: {path, message}[] }`. Checks are header → migrate → unknown types ("update the app") → schema → references (duplicate ids, unknown component/pin, self-wire).
  - `src/io/migrations.ts`: `migrate()` plus an empty `MIGRATIONS` registry (keyed by from-version).
  - `src/topology/nets.ts`: `buildNets(circuit)` gives nets (connected pin groups) with `isGround`; `pinKey`.
  - `test/fixtures/voltage-divider.ts`: `voltageDivider()`. Tests mirror `src/` under `test/`.
- D2 done: `EngineeringCircuit/packages/engine` (`@engineering-circuit/engine`). Public API: `solveDc(circuit)` → `{ ok: true, solution: { pinVoltages, readings, warnings } } | { ok: false, errors }`; issues are `{ componentIds, message }`.
  - `src/linear/`: `DenseMatrix`, `factorLu` / `solveLinear` (partial pivoting; factor once, solve many, ready for D3).
  - `src/graph/disjoint-sets.ts`: union-find.
  - `src/dc/branches.ts`: `DC_MODELS`, one entry per catalog type (compile error if a type is missing). Parts become `resistor` / `voltage` / `current` branches; closed switch and inductor are 0 V branches, capacitor and open switch add nothing, diode/LED are `not-simulated`.
  - `src/dc/topology.ts`: short-circuit check, current-source path check, floating islands → reference pin + warning.
  - `src/dc/mna.ts`: builds and solves the MNA system. `src/dc/solve-dc.ts`: orchestration and readings.
  - Tests: `test/golden/` (textbook + ngspice bridge, netlists in `test/golden/ngspice/`), `test/dc/`, `test/linear/`; helper `test/support/circuit-of.ts` builds circuits as `circuitOf(parts, [["V1.positive", "R1.a"], ...])`.
- Conventions: tabs (width 4); SI units; pin names are per type (`positive/negative`, `a/b`, `anode/cathode`, `terminal`). Current-source current flows out of `positive`. Readings use the passive sign convention (ARCHITECTURE "Engine conventions").
- D7 done:
  - `packages/editing` (`@engineering-circuit/editing`): `applyCommand(circuit, command)` for add-component / remove-component / connect / disconnect / set-parameter (validated by `parseCircuit`, never mutates input; auto ids from catalog `idPrefix`, grid placement). `CircuitDocument`: `apply(command, author)`, `replace`, `undo`, `history` (`"learner" | "agent"`, bounded).
  - `apps/mcp`: `src/server.ts` (`createServer(options)` registers 14 tools), `src/reports.ts` (pure report builders: catalog, simulation, probe, explanation), `src/options.ts` (env config), `src/main.ts` (stdio). Engine exports `isDcSimulated`.
  - `.mcp.json` at repo root registers the server for Claude Code. Verified with an in-memory MCP client (tests) and a real stdio client.
- Format: `defineComponent` now takes `idPrefix`; catalog exports `definitionOf`, `idPrefixOf`, `ComponentDefinition`.
- Tooling: ngspice 47 installed via Homebrew on the owner's Mac (ADR-010). `@types/node@24` + `"types": ["node"]` in `tsconfig.base.json` (MCP SDK needs it).

- D6 done: `apps/web` (Angular 22, zoneless, signals, SVG). `src/app/`:
  - `circuit/`: `circuit-store.ts` (signals over a `CircuitDocument`; `solveDc` + `wireCurrents` as computeds; selection, placing, wiringFrom, paused, editError), `symbols.ts` (`SYMBOLS`, `PART_NAMES`, upright polarity `marks`), `geometry.ts` (pin positions, snap, wire paths), `si-units.ts` (`formatSi`/`parseSi`), `visuals.ts` (flow speed, voltage colour), `part-text.ts`, `examples.ts` (KVL example), `ui-config.ts` (`UI_CONFIG` token: grid, zoom, flow animation).
  - `canvas/` (SVG, place/drag/wire/pan/zoom), `palette/` (dumb: input + output), `inspector/` (edit values, readings), `status/` (errors, warnings).
  - Keys: Esc cancel, Delete remove, R rotate, Ctrl/⌘+Z undo. Clicking a switch flips it.
  - Tests: `*.spec.ts` (Vitest via `ng test`), `e2e/app.spec.ts` (Playwright, 6 flows incl. building a switch circuit from scratch).
- Also added for D6: catalog `defaults` per part (editing fills missing params; MCP `params` now optional), `paramFieldsOf(type)` in format, `move-component` / `rotate-component` commands (clear bends of attached wires), engine `wireCurrents`.
- Root scripts: `pnpm test` (core + web unit), `pnpm typecheck` (tsc + web production build), `pnpm test:e2e`, `pnpm web`.
- D8 done: live link (ADR-014, ARCHITECTURE "Live link").
  - `packages/editing`: `edit-command.ts` (`editCommandSchema`; `EditCommand` is inferred from it), `CircuitDocument` gained `revision`, `subscribe(listener)` and `undo(author)`; `live-protocol.ts` (`clientMessageSchema`, `ServerMessage`, `parseServerMessage`, `liveSocketUrl`, link params `live` + `token`).
  - `apps/mcp`: `src/live/live-server.ts` (`LiveServer.start(document, options)`, `.link`, `.address`, `.close()`; 127.0.0.1, origin + token checked on upgrade, `maxPayload` = `EC_MAX_FILE_BYTES`). `main.ts` creates the shared document and the live server (if it fails to start, the MCP still runs; message on stderr). `createServer(options, { document, live })`. New tools `open_in_app`, `recent_changes`.
- D3b done (ADR-016): format `vcvs` / `vccs` / `ccvs` / `cccs` (sources.ts), `polarized-capacitor` / `potentiometer` / `lamp` / `transformer` (passives.ts), `switch-spdt` (switches.ts), `COMPONENT_CATEGORIES`, `ParamField.range`; `pinDirection` now uses the longer axis. Engine: branch kinds `vcvs`/`vccs`/`ccvs`/`cccs`, `VOLTAGE_KINDS`/`CURRENT_KINDS`, `port` + `DcSolution.ports`, transformer model, reversed-capacitor warning; `POWERING_TYPES` now includes wave and controlled sources. MCP: probe/simulate report `ports`. App: symbols, palette tabs (`data-category`, `data-types`), slider for ranged params, port readings, SPDT click, lamp glow; e2e helper `e2e/support/parts.ts` `choosePart`.
- D3a done (ADR-015): format v2 (`simulation: { timeStep, speed }`, migration 1→2, `DEFAULT_SIMULATION`), `ac-source` / `square-source`. Engine `src/transient/` (`stepTransient(circuit, state, { timeStep, pressed })`, `initialTransientState`, `isTimeDependent`, `waveforms.ts`), companion models in `dc/branches.ts` (`SolveInputs.transient`), `solveCircuit` (general) vs `solveDc`. Editing: `set-simulation` command, `equivalents.ts` (period, rms). MCP: `simulate_over_time`, `set_simulation` (20 tools), `EC_MAX_TRANSIENT_STEPS`. App: `simulation/` (`SimulationRunner`, `simulation.worker.ts`, `SimulationClock`, protocol), store `timeDependent` / `time` / `slowed` / `restartTime`, Restart button, simulation settings and period/RMS hints in the inspector. Golden netlists: `packages/engine/test/golden/ngspice/{rc-charging,rl-rise,rlc-ringing,rc-lowpass-ac}.cir`.
- Obstacle routing: `apps/web/src/app/circuit/routing.ts` `routeAround(from, to, bodies, grid)` (A* on the grid, corners cost 3 squares, keeps one square from every part body incl. its own, falls back to `routeWire` for off-grid pins or no path); `placeBox`; each `SYMBOLS` entry has a `body` box.
- Wire routing: `pinDirection(component, pin)` in `packages/format/src/layout/pins.ts`; `routeWire(from, to, stub)` + `pathThrough(points)` in `apps/web/src/app/circuit/geometry.ts` (one-corner route that leaves outward and arrives from outside; else step out one grid square; else detour). Wires with saved bends are drawn through them unchanged.
- D6 leftovers done: `push-button` (switches.ts), `voltmeter` / `ammeter` / `ohmmeter` (`measurement.ts`). Engine: `solveDc(circuit, { pressed })` (`DcInputs`); ohmmeter = 1 mA test current branch flagged `test` (dropped when open → `resistance: Infinity`), `ComponentReading.resistance`, warning on powered circuits, no ground warning for an unpowered measurement. MCP: `simulate` / `probe` take `pressed`; ohmmeter `resistance` or "open (…)". App: `store.pressed`, `press` / `releaseButtons`, `meterText`, `pushButtonPath`, palette shows meter letters.
- Agent layout (after D8): pin geometry moved to `packages/format/src/layout/pins.ts` (`PIN_OFFSETS`, `rotate`, `pinPosition`; the app's `SYMBOLS` no longer hold pins). `rotate-component` takes an optional exact `rotation`. MCP: `add_component` takes `rotation`; new `move_component`, `rotate_component`; `get_circuit` adds `pinPositions`; `list_component_types` adds `pinOffsets`; layout rules in the server instructions (18 tools). Env `EC_APP_URL`, `EC_LIVE_ORIGINS`, `EC_LIVE_PORT`.
  - `apps/web`: `live/live-link.ts` (socket wrapper, status signal), `CircuitStore.joinLive(url)` (shared vs local document, predicted state, `agentChanges` highlight for `agentHighlightMs`), `circuit/changes.ts`; `App` joins when the URL has `live` + `token`; status bar shows "Live with agent · Agent: …". `store.apply` now returns the resulting `Circuit | undefined`.
  - Tests: `apps/mcp/test/live/live-server.test.ts`, MCP tool tests, `packages/editing/test/live-protocol.test.ts`, store specs with a fake `LiveLink`, `apps/web/e2e/live.spec.ts` (spawns the real MCP server over stdio and drives it while Playwright drives the app).

## Next step
Owner tries D3 (`pnpm web`: AC source, capacitor, transformer + lamp, potentiometer slider). Next deliverable: D4 non-linear parts (diode, LED, BJT, MOSFET with Newton–Raphson) or D5 digital logic. Earlier: owner tries the live link (restart Claude Code or `/mcp` reconnect so the server picks up the new tools; `pnpm web`; ask the agent for `open_in_app`). Then D3 transient analysis (capacitor charging, AC/square sources, time-stepping reusing the LU factorisation; engine to a Web Worker).

## Blockers / open questions
- None.

## Known gaps (do not hide; fix in the listed deliverable)
- Diode/LED have no electrical params yet → D4 adds them with a version bump + migration.
- Wires connect pin to pin only; no mid-wire junction → D6.
- No logic family settings in the file → D5. Time step is fixed (no adaptive stepping); trapezoidal can ring after an abrupt switch on an inductor (as in CircuitJS1).
- A deleted capacitor's stored charge is reused if a new part later gets the same id during the same run (state is keyed by id). Restart clears it.
- Wire routing avoids part bodies but not labels or other wires: a wire may pass close to a part's name, and wires of different nodes can overlap along a grid line.
- A transformer's isolated secondary gets the "Not connected to ground" warning: true (it is isolated) but noisy for a normal transformer circuit; consider wording it as information.
- Planned for later deliverables (by design, see `COMPONENTS.md`): AC/square sources, polarized capacitor, potentiometer, SPDT, transformer, lamp (D3); diodes/transistors (D4); logic (D5); ICs (D9).
- No canvas text notes → D12.
- Horizontal voltage source: its value label and current reading overlap (label placement in `apps/web` canvas).

## Session log (newest first)
| Date | Agent | Did | Left for next |
|---|---|---|---|
| 2026-11-07 | Claude (Opus) | D3b parts: controlled sources, transformer (ngspice K), potentiometer, lamp, SPDT, polarized capacitor; palette categories; ADR-016. 248 core + 71 web + 12 e2e | Owner tries D3; then D4 or D5 |
| 2026-11-07 | Claude (Opus) | D3a time simulation: trapezoidal companions (BE first step), AC/square sources, format v2 settings, worker + clock, MCP over-time tools; 4 ngspice goldens; ADR-015 | D3b parts |
| 2026-11-07 | Claude (Opus) | Obstacle routing (A*) | – |
| 2026-11-07 | Claude (Opus) | Wire routing: wires leave pins outward (`pinDirection` in format, `routeWire` in apps/web geometry), never back over their own parts | Owner tries it; then D3 |
| 2026-11-07 | Claude (Opus) | D6 leftovers: push button, voltmeter, ammeter, ohmmeter (engine `DcInputs.pressed`, ohmmeter test current / open / powered warning, MCP `pressed` + resistance, app hold-to-press and meter displays) | Owner tries it; wire routing; then D3 |
| 2026-11-07 | Claude (Opus) | Agent layout: shared pin geometry in format, `move_component` / `rotate_component`, `rotation` on add, pin positions in `get_circuit` | Owner tries it; then D3 |
| 2026-11-07 | Claude (Opus) | D8 live link: MCP-hosted WebSocket, shared document, `open_in_app` / `recent_changes`, agent-change glow; 147 core + 46 web unit + 8 e2e tests; ADR-014 | Owner tries it; agent move/rotate tools; then D3 |
| 2026-11-07 | Claude (Opus) | D6 web app (Angular 22 + SVG): 127 core + 36 web unit + 6 e2e tests; catalog defaults, param fields, move/rotate, wire currents; ADR-013 | Owner tries app; then D3 or D8 |
| 2026-11-07 | Claude (Opus) | D7 MCP server (SDK v2, 14 tools) + `packages/editing` (commands, author history, undo); 104 tests; `.mcp.json`; ADR-012 | Owner tries MCP; then D3 or D6 |
| 2026-11-07 | Claude (Opus) | D2 DC engine: MNA + LU, plain-language diagnostics, 26 engine tests (67 total), ngspice bridge check; ADR-010/011 | D7 MCP (recommended) |
| 2026-11-07 | Claude (Opus) | COMPONENTS.md inventory; per-category component catalog; unknown-type error; 41 tests | Start D2 |
| 2026-11-07 | Claude (Opus) | Restructured format pkg (src/schema, io, topology; test/ mirror), tabs width 4 | Start D2 |
| 2026-11-07 | Claude (Opus) | D1 circuit format v1, 21 tests | Start D2 |
| 2026-11-07 | Claude (Opus) | D0 foundation | Start D1 |

## Template for handing over
```
### <date> <agent>
Deliverable: D<id>, status now <status>
Done: <bullets>
Verified by: <commands run + result>
Next: <exact next action>
Gotchas: <anything surprising>
```
