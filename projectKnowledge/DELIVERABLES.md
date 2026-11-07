# Deliverables

Status: `todo` · `in-progress (<agent>)` · `blocked (<reason>)` · `done`
A deliverable is `done` only when every acceptance criterion passes and is verified by running it.

| ID | Deliverable | Acceptance criteria | Depends | Status |
|---|---|---|---|---|
| D0 | Foundation | Folders, knowledge docs, git repo, pnpm workspace, strict TS, Vitest runs | – | done |
| D1 | Circuit format v1 (`packages/format`) | Types for components, nodes, wires, params; validation with clear errors; version field + migration hook; tests | D0 | done |
| D2 | DC engine (`packages/engine`) | MNA solver: resistor, voltage/current source, ground, wire, switch; capacitor (open) and inductor (short) at DC. Plain-language errors (short circuit, no current path, not-yet-simulated part) and floating-part warnings. Golden tests: Ohm's law, voltage divider, KVL, series/parallel, current divider, Wheatstone bridge vs ngspice | D1 | done |
| D3 | Transient analysis | **D3a (done):** capacitor, inductor, switch, time stepping; AC and square sources; simulation settings in the file (format v2); engine runs in a Web Worker in `apps/web`; MCP `simulate_over_time` / `set_simulation`. Golden tests vs ngspice: RC charging, RL rise, RLC ringing, RC low-pass at its corner (all within 1%; RC within 0.003%). **D3b (todo):** polarized capacitor, potentiometer, SPDT switch, lamp, transformer, controlled sources (`COMPONENTS.md` rows marked D3) | D2 | in-progress (Claude) |
| D4 | Non-linear parts | Diode, LED, BJT, MOSFET (Newton–Raphson). Golden tests: diode drop, transistor switch | D3 | todo |
| D5 | Digital + mixed signal | Logic gates, flip-flops, clock, analog↔digital thresholds. Golden tests: half/full adder, counter | D2 | todo |
| D6 | Web UI MVP (`apps/web`) | Place, wire, move, rotate, delete parts; edit values (SI input like `4.7k`); click switches; undo; pause/resume; animated current; voltage colours; node voltages and part readings; plain-language errors/warnings. All edits via `packages/editing`. Unit tests (Vitest) + Playwright e2e. (Web Worker moved to D3: DC solves take well under a millisecond) | D2 | done |
| D7 | MCP server (`apps/mcp`) + shared edit commands (`packages/editing`) | Tools: list_component_types, create_circuit, add_component, remove_component, connect, disconnect, set_parameter, undo, get_circuit, simulate, probe, explain_circuit, open_circuit, save_circuit. Edits record author + undo. Tested from an MCP client (in-memory) and over real stdio; registered in `.mcp.json` | D2 | done |
| D8 | Live link | MCP edits appear live in the open web app (WebSocket); learner edits in the app reach the agent (`recent_changes`); one shared `CircuitDocument` and history, undo from either side; `open_in_app` link with session token; loopback + origin + token checks; app keeps working alone if the link closes. Unit tests + Playwright e2e driving the real MCP server over stdio | D6, D7 | done |
| D9 | Oscilloscope + ICs | Scope view; 555 timer, op-amp, 7-segment. Golden tests: 555 astable frequency, op-amp gain | D4, D5, D6 | todo |
| D10 | Save/load + PWA | Save/load files, IndexedDB library, installable offline PWA | D6 | todo |
| D11 | Desktop/mobile (`apps/desktop`) | Tauri builds for macOS, Windows, Linux; Android build | D10 | todo |
| D12 | Lessons + AI tutor | Lesson format; load_lesson / check_solution MCP tools; 5 starter lessons | D7, D9 | todo |
| D13 (opt) | Microcontrollers | AVR emulation running user code connected to circuit pins | D9 | todo |
| D14 (opt) | Backend | Spring Boot 4: accounts, community sharing | D10 | todo |

Parallel-safe once D2 is done: D3/D5 (engine, separate files), D6 (UI), D7 (MCP).
