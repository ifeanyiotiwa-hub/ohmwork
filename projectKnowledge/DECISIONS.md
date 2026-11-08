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

## ADR-014: Live link is a WebSocket hosted by the MCP server; whole-state broadcast
The MCP server (already running whenever an agent is) holds the one `CircuitDocument` and serves it to the app over a WebSocket (`ws` package; Node has a WebSocket client built in but no server). The app sends edit commands; the server applies them in arrival order and broadcasts the whole circuit with the change and its author. Circuits are small (kilobytes), so sending whole state is simpler and safer than diffs, and a single server applying commands in order needs no OT/CRDT merging. Messages are validated with Zod both ways (`clientMessageSchema`, `parseServerMessage` + `parseCircuit`).
Security: any website open in the browser can reach a localhost server, so the server listens on 127.0.0.1 only, accepts only allowed `Origin`s (the app URL, `EC_APP_URL`, plus `EC_LIVE_ORIGINS`), and requires a random per-session token (constant-time compare) carried in the `open_in_app` link; the app only connects to loopback `ws://` addresses. Port defaults to any free port (`EC_LIVE_PORT` to fix one), so several agent sessions never collide.
Trade-off: the link lives as long as the MCP server; when it closes the app keeps the last shared circuit and works alone. A standalone always-on hub was rejected until there is a need (another process to install and manage).

## ADR-015: Time simulation: trapezoidal companion models, fixed step, worker per frame; format v2
- Method: capacitors and inductors use trapezoidal companion models (a conductance plus a current source per step), as CircuitJS1 and SPICE do. A part's first step uses backward Euler, like SPICE after a breakpoint: its starting current is unknown, and trapezoidal would carry that error forward (measured: RC error at τ/100 drops from 0.29% to 0.0024%, and becomes second order). Fixed time step from the file; no adaptive stepping yet.
- Start: every capacitor empty and inductor at 0 A (as EveryCircuit and CircuitJS1 do), not the DC operating point. State is matched by component id, so edits and switch flips keep stored charge.
- Sources: SPICE `SIN` and `PULSE` (instant edges). A plain DC solve uses SPICE's DC value: offset for a sine, low for a square.
- App: plain circuits are still solved synchronously on the main thread; circuits with time-dependent parts run in a Web Worker (`SimulationRunner` behind `simulation.worker.ts`). Each animation frame asks for real seconds × speed; one request in flight, steps per frame capped (`UI_CONFIG.simulation`) so a heavy circuit slows down instead of freezing, shown as a warning. Frames carry a circuit id so a frame solved for an older edit is never shown against a newer circuit.
- Format v2 adds required `simulation: { timeStep, speed }` (CircuitJS1 also saves both); migration 1→2 fills the defaults (5 µs, CircuitJS1's default step; speed 0.01).
- Equivalent quantities are converted in `packages/editing` (`period`→`frequency`, `rms`→`amplitude`), so the UI and agents share one rule and the file stores one value.

## ADR-016: D3b modelling: controlled sources as MNA stamps, transformer from them, ports for multi-port parts
- Controlled sources are new branch kinds stamped directly into MNA (SPICE E, G, H, F). Current-output kinds push current out of their `positive` pin, matching our `current-source` (SPICE G/F define the opposite direction). CCVS/CCCS read the current of a 0 V sense branch of the same part.
- A transformer is coupled inductors: per step each winding is a conductance, a VCCS for the mutual term and a history current (Γ = (Δt/2)·L⁻¹, Δt·L⁻¹ on the first step). Coupling must be below 1 (k = 1 makes L singular). Checked against ngspice `K` within 1% (light and loaded secondary).
- Multi-port parts tag branches with a `port`; solutions carry `ports` ("T1/primary") alongside two-pin `readings`, and stored state is kept per port.
- Lamp: fixed resistance V²/P, defaults 6 V / 1 W (CircuitJS1's lamp is a 120 V / 100 W filament with thermal lag; ours is chosen to light from the default 5 V source).
- Polarized capacitor past its reverse limit is a warning (CircuitJS1 stops the simulation).
- The palette groups parts by the catalog's category files (`COMPONENT_CATEGORIES`); unitless numbers show without SI prefixes (0.999, not 999 m).

## ADR-017: Non-linear parts: one Device interface, Newton–Raphson in solveCircuit, CircuitJS1 models
- A non-linear part is a `device` branch: it lists its terminals, which terminal pairs conduct (for topology checks), and `linearize(voltages, state)` returning I = G·V + offset at the present guess plus its limited junction voltages. Diodes, Zeners, LEDs, the three junctions of an RGB LED (with `port`s), BJTs and MOSFETs all use it; the MNA stamps any device the same way.
- `solveCircuit` iterates: linearize every device, solve, until node voltages move less than SPICE's VNTOL + RELTOL (1 µV + 0.1%) and no junction was limited; 200 iterations at most, then a plain-language "didn't settle" error. A time step starts from the previous step's pin voltages (`TransientState.pinVoltages`).
- Models and defaults follow CircuitJS1 (which follows SPICE): Shockley diode with `limitStep` (SPICE pnjlim) and a junction conductance of 1% of IS; Zener breakdown as CircuitJS1's mirrored exponential set to 5 mA at the breakdown voltage; Ebers–Moll BJT (Gummel–Poon level 1 without Early effect or resistances); square-law MOSFET (level 1, λ = 0) with 0.5 V steps per iteration and a 1e-12 S drain–source conductance. Thermal voltage 0.025865 V (27 °C).
- Series resistance (LED RS) is solved inside the diode (junction voltage by an inner Newton loop), since circuits have no internal nodes.
- Format v3 adds the electrical parameters; the 2→3 migration fills diodes and LEDs with values frozen in the migration (not read from the catalog), so a later default change never changes old files.
- Not modelled yet: junction capacitances (switching is instantaneous over time), Early effect, temperature; no gmin or source stepping when Newton fails.

## ADR-018: Digital logic inside the analog solve, one time step of delay (not event-driven)
- Logic parts live in the same MNA solve as analog parts, so mixing is automatic: a gate output is an ideal voltage source to ground at 0 V or `simulation.logicHigh` (CircuitJS1 GateElm); an input reads 1 above half of it (CircuitJS1 `getThreshold`). Parts have no supply pins (as in EveryCircuit); if the circuit has no ground part an internal ground net is added.
- Outputs change between solves, never inside one. Over time, each logic part reads its inputs at the end of a step and drives its new outputs during the next: one time step of propagation delay. That makes feedback (latches from gates, ring oscillators) well defined and keeps every step linear in the logic. Flip-flops and the counter act on a rising clock edge sampled this way.
- A plain DC solve repeats until no output changes (at most 64 passes) and reports an oscillator in plain words.
- The architecture's original plan was an event-driven digital engine. Rejected for now: a separate scheduler plus analog↔digital converters at every boundary is far more machinery, while stepping logic with the analog solve is what CircuitJS1 does and is exact enough for teaching. Revisit if large digital circuits become slow.
- Format v4 adds `simulation.logicHigh` (5 V); migration 3→4 fills it; migration 1→2 now writes its own frozen values.
- An unconnected logic input reads 0 and raises no "not connected to ground" warning.

## ADR-019: Op-amp, 555 and oscilloscope
- Op-amp: CircuitJS1's parameters (gain 100000, output ±15 V, no supply pins) with a smooth limit target = middle + half·tanh(gain·(V+ − V−)/half) behind 1 mΩ, instead of CircuitJS1's switch between a VCVS and a fixed rail, so Newton–Raphson never jumps modes. Cost: within 0.03% of finite-gain theory while the output is well inside the rails (0.014% at 11 V of 15 V).
- 555: CircuitJS1 TimerElm. Analog side (5 kΩ / 10 kΩ divider to control, output through 1 Ω, discharge through 10 Ω while low) is ordinary branches; the comparator/latch logic is a sequential part updated once per step (`digital/timer-555.ts`), sharing the logic memory of D5 (`Sequential` in `digital/sequential.ts`). Because R1 keeps feeding the discharge pin, the low time is slightly longer than the datasheet formula (about 1% for R1 = 1 kΩ, R2 = 10 kΩ); tests check the exact model and the formula within 2%.
- Oscilloscope: a `scope-probe` part (no branches) marks what to record. The worker samples every probe at min(steps, 64) evenly spaced steps per frame; the app keeps the last `windowRealSeconds` (4) × speed of simulated time, at most 8000 samples, and draws all probes on one auto-scaled voltage axis.

## ADR-020: D9b parts: fixed-width converters, a logic 7-segment display, relay as a sequential part
- ADC and DAC are fixed at 4 bits (`adc-4bit`, `dac-4bit`): a part type's pins never change (ADR-009). Behaviour is CircuitJS1's: ADC code = trunc(15·Vin/Vref) (no rounding), DAC out = code·V(vref)/15 as a VCVS on vref so it tracks the reference within a solve.
- The 7-segment display is CircuitJS1's default logic display (a segment lights at logic 1; no common pin), so a decoder can drive it directly. An LED-accurate display with a common pin can come later.
- Relay (CircuitJS1 RelayModel defaults: 0.2 H, 20 Ω, on 20 mA, off 15 mA): the coil is one series-RL companion branch pair (no internal nodes needed); the contacts are a sequential part reading the coil current once per step. Sequential parts now read port currents as well as pin voltages (`PartReadings`), and `DcSolution.states` reports logic and switching outputs (used to draw relay levers).
- Pins that only read a voltage (logic inputs, display segments, ADC/DAC inputs, probes, voltmeters) raise no "not connected to ground" warning when left open; unconnected op-amp and 555 inputs still warn.

## ADR-021: Keeping circuits: IndexedDB library, files, autosave, PWA
- In-browser library on plain IndexedDB (no wrapper library): store `circuits` (id, name, savedAt, JSON) listed newest first up to `UI_CONFIG.library.maxEntries`; saving under an existing name updates it. Store `workspace` keeps the circuit being edited (autosaved `autosaveDelayMs` after the last change, restored on load unless joining a live link). Records hold the same JSON as files, so opening runs the format's checks and migrations.
- Files: `.circuit.json` download (name from the circuit, made safe) and open via a file input, size-limited (`maxFileBytes`), errors explained in the dialog. A circuit can be renamed through a new `rename-circuit` edit command (shared with the live link).
- Storage failures are shown in the status bar ("isn't being kept… download it"), never swallowed.
- PWA via `ng add @angular/pwa` (Angular service worker, production builds only), with the manifest renamed and our own icon (rendered from `public/icons/icon.svg`). Offline is tested for real: Playwright's offline switch also blocks the service worker in Chromium, so the test serves a production build itself, stops the server, and reloads. The service worker serves offline once its first housekeeping tick has run (a second or two after the first load).
- The status bar is height-capped and scrolls, so warnings never shrink the canvas.

## ADR-022: Lessons check behaviour, live in the circuit, and the AI tutors through MCP
- Lesson checks look at what the circuit does (parts present, DC readings optionally with buttons held, a node voltage, a reading at a time over a run, a truth table with output columns in any order, no errors), never at ids or layout, so any correct circuit passes. A failed check says what the circuit actually does, with real values ("LED1 carries 3.32 mA."), which is what the tutor teaches from. Every starter lesson is tested to pass on a reference circuit, fail when empty, and catch a typical mistake.
- The lesson id is stored in the circuit (format v5 `lesson`), not in app or server state: it survives saving, reloading and the live link, and the app shows the lesson card whenever the AI starts a lesson. Text notes are a separate `notes` list in the circuit (format v5), edited by the same commands from the app and the AI.
- The AI tutor is the agent itself, steered by MCP: `load_lesson` returns the goal and steps to share and `hintsForTutor` to give one at a time; `check_solution` grades; the `tutor` prompt sets the coaching style (let the learner build, one hint at a time, explain with real numbers, check when they think they are done). No model is embedded in the app.
- SI formatting moved to `packages/format` (third user: lessons), re-exported by the app.

## ADR-023: Ratings, LED colours, settling after switches, runaway current (D15a)
- Ratings are part parameters with sourced defaults: resistor `powerRating` 0.25 W (common ¼ W carbon film), diode `maxCurrent` 1 A (1N4001–1N4007), LED `maxCurrent` 30 mA (Kingbright 5 mm; green 25 mA). Exceeding one is a warning that names the part and the numbers ("LED1 carries 57 A, but it is rated for 30 mA: a real one would burn out."). A lamp warns above 110% of its rated voltage (our rule; no burn-out data). Format v6 fills ratings in older files with frozen values.
- LED colours have their own models (`LED_MODELS`): red is CircuitJS1's default-led (1.85 V at 20 mA, inside Kingbright's red range); yellow, green, blue, white keep its N and RS with IS set for Kingbright's typical forward voltage at 20 mA (2.1, 2.2, 3.3, 3.3 V; white is a blue InGaN chip under phosphor, a discontinued listing says 3.8 V). A new LED gets its colour's model; recolouring switches model only while the values are still the old colour's, so customised values are kept. Old files keep their (red) values.
- After any switch, push button, two-way switch, relay or logic output changes, ten steps use backward Euler. With a fixed step the trapezoidal rule makes a decay faster than half a step flip sign every step (factor −0.43 measured for τ = 1 µs, Δt = 5 µs); backward Euler damps it. SPICE takes one such step and shrinks the step; without adaptive stepping (D16) we hold it longer. RC accuracy after a switch stays within 0.1%.
- A junction whose conductance passes 1e6 S is a source driving it with nothing to limit the current: reported by name ("The current through D1 grows without limit… Add a series resistor.") instead of overflowing into "no single solution". gmin and source stepping were not added: no circuit was found that fails to settle once runaway is diagnosed; add them when one turns up (with it as the test).

## ADR-024: Junctions, command batches, multi-select, label placement, picture export, reconnect (D15b)
- A mid-wire join is a `junction` part (one pin `terminal`, id prefix `J`, no electrical model), not a new wire shape: wires stay pin to pin, so the format, the netlist builder and the AI tools need nothing new. Clicking a wire while wiring runs `split-wire` (the wire becomes two halves through a new junction) and then `connect`, as one step.
- Several edits that form one action are a `batch` command: applied in order, all or nothing, one history entry and one undo. Used for joining a wire, paste ("Pasted N parts"), group move and group delete. Paste renumbers ids with the same `nextComponentId` the editor uses and offsets by two grid squares each time.
- Selection: click selects one part, Shift-click toggles, Shift-drag on the background draws a box. Ctrl/⌘ + A, C, V, Z; Escape clears. The clipboard is in memory (one app window), not the system clipboard.
- A part's live reading goes below its body, away from the voltages beside its pins; under its name when the part is upright, a meter, or its name is already below the body (an LED, whose light arrows are above). Checked by unit tests and by an e2e test comparing the rendered text boxes.
- Picture export: the canvas is already SVG, so the picture is that SVG with computed styles inlined, grid, hit areas, pins and current flow removed, cropped to the circuit plus a margin. PNG is the same SVG drawn on a canvas at 2× scale.
- Live-link reconnect: the app retries the same address with back-off (1, 2, 4, 8 s, then every 8 s, 30 attempts) and works on its own copy meanwhile. The MCP server reads a fixed token from `EC_LIVE_TOKEN` (at least 16 characters, else it refuses to start; and a fixed port, as before), so a restarted server is found again. If the server comes back empty (revision 0, no parts) while the learner's copy has parts, the app sends its copy; otherwise it takes the server's.

## ADR-025: The desktop app and saving to disk (D11a)
- `apps/desktop` is a Tauri 2 shell around the built web app (`apps/web/dist/web/browser`); there is no Rust logic beyond registering the dialog and file plugins. Identifier `dev.engineeringcircuit.app`: the desktop app's library (IndexedDB) lives in a folder named after it, so changing it later loses learners' saved circuits.
- Least privilege: the window may use the save and open dialogs and read, write and stat files, with no file-system scope. The dialog plugin adds only the path the learner picked to the scope, for that run. The app cannot touch any other file.
- CSP: scripts from the app only (Tauri adds hashes for inline ones); styles allow inline, because Angular adds component `<style>` tags at run time and the build inlines critical CSS, so Tauri's style nonces are switched off for `style-src` only; `connect-src` allows Tauri's IPC and `ws://127.0.0.1:*` for the live link.
- The service worker is off inside Tauri (`isTauri()`): the files are already on disk, and the webview does not run service workers.
- Saving to disk (BACKLOG, D11): one `FILE_PICKERS` token picks the desktop app's dialogs, else the browser's File System Access API (Chrome, Edge), else none (Firefox, Safari: download and a file input, as before). A file once opened or saved is remembered and "Save to <file>" writes it again in place. In Chrome and Edge, "Save as file…" and the pictures now ask where to save instead of downloading.
- Windows and Linux builds run in GitHub Actions (`.github/workflows/desktop.yml`, `tauri-action`), since Tauri does not cross-compile them from macOS; the macOS build is made and checked locally.

## ADR-026: Android build and touch use (D11b)
- Android is the same Tauri app (`apps/desktop/src-tauri/gen/android`, generated by `tauri android init` and committed, as Tauri recommends). NDK 30 (the newest stable), Gradle wrapper 9.8.2 (Tauri generated 9.6.1; 9.8.2 is supported by its Android Gradle Plugin 9.3.1). iOS is not built: it needs full Xcode.
- On Android the file dialogs return `content://` URIs, which the fs plugin reads and writes; the file is named by the decoded last part of the URI.
- Touch: one finger pans (as the mouse does); two fingers pinch to zoom and pan together (`canvas/gestures.ts`, `pinchView`, within the wheel's zoom limits); pressing and holding (`longPressMs` 500) acts as Shift: on a part it adds it to the group or takes it out, on the background it starts a selection box. A push button is exempt, because holding it is how it is used. Moving more than the drag threshold cancels the hold.
- Without a keyboard, the inspector offers what the shortcuts do: a group panel ("N parts selected": Copy, Paste, Clear, Delete), Copy and Paste on a single part, and Paste when nothing is selected. The header's buttons wrap on narrow screens.
- Touch is tested with real touch input through Chrome's DevTools protocol (`e2e/touch.spec.ts`), since synthetic pointer events cannot be captured.

## ADR-027: Audit fixes, part 1 (D15c)
- A live session keeps its own workspace slot, named by the server address without the token (the token is never stored). The app restores that slot before joining, and a server that comes back empty is given the restored copy (the reconnect rule of ADR-024). The learner's own workspace is never overwritten by a live session, and work in one survives a reload after the agent has gone.
- A kept circuit that no longer opens is set aside (not dropped and then overwritten by autosave), reported in the status bar with the reason, and offered as "Download damaged copy" in the Library until downloaded.
- Pictures are framed by what is drawn: each shape's rendered box converted to circuit units, so rotated bodies, labels and notes are inside. Click targets, pins, the grid and current dots don't count.
- Canvas shortcuts don't act while a dialog is open; Ctrl/⌘+C copies selected page text when there is some; other keys with Ctrl/⌘/Alt are left to the browser.
- The MCP file tools only read and write inside the workspace folder (relative paths; `..` or an absolute path outside is refused).
- Tests now hold the documented accuracy: RC charging 0.003%, RLC within 1% at every point, op-amp 0.03%; every starter lesson has a typical-mistake test; the square source is simulated in a circuit.
- RGB LED (format v7): one emission coefficient and series resistance shared, saturation current and current rating per colour, from Kingbright WP154A4SUREQBFZGW (red 1.9 V/30 mA; green 3.3 V/25 mA and blue 3.3 V/30 mA, both InGaN, so on the blue LED model). Old files keep their single model on all three colours (they behave as before) and gain the datasheet ratings. Burn-out warnings name the colour.
