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
- Conventions: tabs (width 4); SI units; pin names are per type (`positive/negative`, `a/b`, `anode/cathode`, `terminal`). Current-source current flows out of `positive`.

## Next step
D2: DC engine in `EngineeringCircuit/packages/engine`. MNA solver for resistor, voltage/current source, ground, closed/open switch. Consume `buildNets`. Golden tests: Ohm's law, voltage divider (expect 5 V mid-node), series/parallel. Port the algorithm approach from CircuitJS1 (credit in a header line, per ADR-003).

## Blockers / open questions
- CircuitJS1 upstream is now TypeScript (`ts/` folder; the Java `CirSim.java` is gone, 2026-11-07). ADR-003 assumed a Java/GWT port. Before D2: read their MNA code in `ts/` and decide whether to port from it (likely simpler), then add an ADR superseding ADR-003's "port from Java".
- Unclear icons in the owner's reference screenshots are listed in `COMPONENTS.md`; confirm with the owner.

## Known gaps (do not hide; fix in the listed deliverable)
- Diode/LED have no electrical params yet → D4 adds them with a version bump + migration.
- Wires connect pin to pin only; no mid-wire junction → D6.
- No simulation settings (time step, duration, logic family) in the file → D3/D5.
- No meters/probes, AC sources, potentiometer, push button, SPDT → see `COMPONENTS.md`.
- No canvas text notes → D12.

## Session log (newest first)
| Date | Agent | Did | Left for next |
|---|---|---|---|
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
