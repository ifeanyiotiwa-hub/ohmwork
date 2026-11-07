# Decisions (ADR log)

Append-only. To change a decision, add a new entry that supersedes the old one.

## ADR-001: Clean-room, inspired by EveryCircuit
Build on the idea only. Never decompile the app or reuse its code, assets, name, or look. Using the paid app to observe behaviour and features is fine; write specs in our own words.

## ADR-002: TypeScript everywhere, engine runs on the device
Real-time animation and offline use need client-side simulation. One language serves the engine, UI, MCP, and tests. Java/Spring Boot is reserved for an optional future backend (accounts, sharing), not the simulation.

## ADR-003: Port CircuitJS1 algorithms to TypeScript (not fork)
CircuitJS1 (Paul Falstad, GPL-2.0) has years-proven simulation math, but it's built on GWT (Java→JS), which is legacy. We port the algorithms into modern TS with golden tests. Ported files credit CircuitJS1 in a header line.

## ADR-004: License GPL-2.0-or-later
Required for the ported CircuitJS1 code, and matches the free and open-source goal.

## ADR-005: Angular 21 + PixiJS for the UI
Angular is the owner's existing stack. PixiJS (GPU 2D) handles many animated current dots smoothly.

## ADR-006: Tauri 2 for desktop and mobile, PWA for the web
Small native builds from the same web code; installable and offline on any device.

## ADR-007: projectKnowledge outside the code package, both in one git repo
`circuitProject/` is the git root, so knowledge and code version together and agents always see matching docs.

## ADR-008: Zod v4 strict schemas for the circuit format
Zod gives readable errors with exact paths, TS types from one definition, and JSON Schema export for MCP tools; the MCP SDK uses it too. Objects are strict, so a misspelled field (e.g. `resistence`) is an error rather than silently dropped. This matters because AI agents write these files. Adding new component types is additive and doesn't need a version bump; renaming or removing fields does, with a migration.

## ADR-009: Component catalog, one entry per part
Each part is one `defineComponent(type, { pins, params })` entry in a category file under `packages/format/src/schema/components/`. The union schema, types, and pin lookup are derived from the catalog, so pins and params can't drift apart and adding a part touches one place. `COMPONENTS.md` is the inventory and the add-a-part checklist. Unknown types are checked before schema validation so an older app tells the user to update instead of showing a generic schema error. Pins are static per type (gates use fixed input counts); revisit only if a part truly needs params-dependent pins.

## ADR-010: ngspice as an independent test oracle
Golden tests use textbook answers where they exist and ngspice (v47, `brew install ngspice`) for circuits that need a second opinion. The `.cir` netlist is committed next to the test (`packages/engine/test/golden/ngspice/`) and its output values are pasted into the test, so tests never need ngspice installed. ngspice is a development tool only; it is not shipped in the app.

## ADR-011: Engine is our own TypeScript, following CircuitJS1's algorithms (supersedes ADR-003's "port from Java")
CircuitJS1 is now TypeScript upstream (`ts/`, checked 2026-11-07). We still don't copy its files: its element classes mix drawing, UI, and maths, which breaks our rule that the engine knows nothing about the screen. We follow its documented method (MNA, wires merged into nodes, companion models, Newton iteration) and credit it in a header line where a convention or algorithm is taken from it. Difference by design: CircuitJS1 silently ties floating nodes to ground with 1e8 Ω; we report them as warnings with a named reference pin, and report short circuits and current-source open circuits as plain-language errors.

## ADR-012: MCP server on SDK v2 over stdio; edits through `packages/editing`
The MCP TypeScript SDK v1 (`@modelcontextprotocol/sdk`) is maintenance-only since v2 shipped (2026-07-27); we use v2 (`@modelcontextprotocol/server` 2.4, spec 2026-07-28) with `z.object` input schemas (the raw-shape form is deprecated). Local mode is stdio, started with `tsx`; remote (Streamable HTTP) comes with hosting. Every edit goes through `applyCommand`, which validates the result with the format's own parser, so tools and UI get identical errors. `CircuitDocument` keeps an author-tagged, bounded history (snapshot undo; small circuits make snapshots cheap). Tool errors are plain lines (`path: message`), not JSON, so the agent reads them directly. Limits and the workspace folder come from env (`EC_HISTORY_LIMIT`, `EC_MAX_FILE_BYTES`, `EC_WORKSPACE_DIR`, else pnpm's `INIT_CWD`).

## ADR-013: SVG canvas instead of PixiJS; Web Worker deferred to D3 (supersedes ADR-005's renderer)
Learning circuits have tens of parts, not thousands. SVG renders crisply at any zoom, is plain Angular template code (no imperative render loop), is clickable and assertable by Playwright, and is easy to debug in devtools. Current flow is a CSS dash animation per wire, speed from the engine's wire currents (`wireCurrents`, KCL over each node's wire tree). If a circuit ever needs thousands of animated elements, a PixiJS renderer can replace `CircuitCanvas` without touching the store, engine, or format. The engine stays on the main thread until D3: a DC solve takes well under a millisecond; the worker exists for continuous time-stepping.
Also: Angular 22 (current stable; the project rule is 21+). The web app follows the same TypeScript strictness as the packages (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noImplicitReturns`, `noFallthroughCasesInSwitch`; `noPropertyAccessFromIndexSignature` off everywhere). Workspace packages are excluded from the dev server's prebundling (`angular.json` → `serve.options.prebundle.exclude`) because they ship TypeScript source; shared classes use TS `private`, not `#private`, so Angular's compile needs no `tslib` helpers inside packages.
