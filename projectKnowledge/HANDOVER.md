# Handover

## Current state
- D0 done: folders, docs, git, pnpm workspace, strict TS 7, Vitest 5.
- D1 done: `EngineeringCircuit/packages/format` (`@engineering-circuit/format`, zod 4).
  - `components.ts`: component schemas (ground, voltage/current source, resistor, capacitor, inductor, switch, diode, led) and `COMPONENT_PINS`.
  - `circuit.ts`: `Circuit`, `Wire`, `PinRef`, `createCircuit`, `FORMAT_ID`, `CURRENT_VERSION = 1`.
  - `parse.ts`: `parseCircuit` / `parseCircuitJson` return `{ ok, circuit } | { ok: false, errors: {path, message}[] }`. Checks are header → migrate → schema → references (duplicate ids, unknown component/pin, self-wire).
  - `migrations.ts`: `migrate()` plus an empty `MIGRATIONS` registry (keyed by from-version).
  - `nets.ts`: `buildNets(circuit)` gives nets (connected pin groups) with `isGround`; `pinKey`.
  - `fixtures.ts`: `voltageDivider()` for tests.
- Conventions: SI units; pin names are per type (`positive/negative`, `a/b`, `anode/cathode`, `terminal`). Current-source current flows out of `positive`.

## Next step
D2: DC engine in `EngineeringCircuit/packages/engine`. MNA solver for resistor, voltage/current source, ground, closed/open switch. Consume `buildNets`. Golden tests: Ohm's law, voltage divider (expect 5 V mid-node), series/parallel. Port the algorithm approach from CircuitJS1 (credit in a header line, per ADR-003).

## Blockers / open questions
- None.

## Session log (newest first)
| Date | Agent | Did | Left for next |
|---|---|---|---|
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
