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

## Next step
Owner tries the MCP in Claude Code (restart Claude Code in `circuitProject/`, approve `engineering-circuit`). Then, recommended: D3 transient analysis (capacitor charging, AC/square sources; time-stepping with the existing LU) or D6 web UI (Angular; must reuse `packages/editing` for every edit). They can run in parallel worktrees. D8 (live link) joins MCP and UI on one `CircuitDocument`.

## Blockers / open questions
- None.

## Known gaps (do not hide; fix in the listed deliverable)
- Diode/LED have no electrical params yet → D4 adds them with a version bump + migration.
- Wires connect pin to pin only; no mid-wire junction → D6.
- No simulation settings (time step, duration, logic family) in the file → D3/D5.
- No meters/probes, AC sources, potentiometer, push button, SPDT → see `COMPONENTS.md`.
- No canvas text notes → D12.

## Session log (newest first)
| Date | Agent | Did | Left for next |
|---|---|---|---|
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
