# Deliverables

Status: `todo` · `in-progress (<agent>)` · `blocked (<reason>)` · `done`
A deliverable is `done` only when every acceptance criterion passes and is verified by running it.

| ID | Deliverable | Acceptance criteria | Depends | Status |
|---|---|---|---|---|
| D0 | Foundation | Folders, knowledge docs, git repo, pnpm workspace, strict TS, Vitest runs | – | done |
| D1 | Circuit format v1 (`packages/format`) | Types for components, nodes, wires, params; validation with clear errors; version field + migration hook; tests | D0 | done |
| D2 | DC engine (`packages/engine`) | MNA solver: resistor, voltage/current source, ground, wire, switch; capacitor (open) and inductor (short) at DC. Plain-language errors (short circuit, no current path, not-yet-simulated part) and floating-part warnings. Golden tests: Ohm's law, voltage divider, KVL, series/parallel, current divider, Wheatstone bridge vs ngspice | D1 | done |
| D3 | Transient analysis | Capacitor, inductor, switch, time stepping. Golden test: RC charging curve within 1% | D2 | todo |
| D4 | Non-linear parts | Diode, LED, BJT, MOSFET (Newton–Raphson). Golden tests: diode drop, transistor switch | D3 | todo |
| D5 | Digital + mixed signal | Logic gates, flip-flops, clock, analog↔digital thresholds. Golden tests: half/full adder, counter | D2 | todo |
| D6 | Web UI MVP (`apps/web`) | Place, wire, delete parts; run/pause; animated current; voltage colours; probe values. Engine in Web Worker. Playwright smoke test | D2 | todo |
| D7 | MCP server (`apps/mcp`) | Tools: create_circuit, add_component, connect, set_parameter, simulate, probe, explain_circuit. Tested from an MCP client | D2 | todo |
| D8 | Live link | MCP edits appear live in the open web app (WebSocket) | D6, D7 | todo |
| D9 | Oscilloscope + ICs | Scope view; 555 timer, op-amp, 7-segment. Golden tests: 555 astable frequency, op-amp gain | D4, D5, D6 | todo |
| D10 | Save/load + PWA | Save/load files, IndexedDB library, installable offline PWA | D6 | todo |
| D11 | Desktop/mobile (`apps/desktop`) | Tauri builds for macOS, Windows, Linux; Android build | D10 | todo |
| D12 | Lessons + AI tutor | Lesson format; load_lesson / check_solution MCP tools; 5 starter lessons | D7, D9 | todo |
| D13 (opt) | Microcontrollers | AVR emulation running user code connected to circuit pins | D9 | todo |
| D14 (opt) | Backend | Spring Boot 4: accounts, community sharing | D10 | todo |

Parallel-safe once D2 is done: D3/D5 (engine, separate files), D6 (UI), D7 (MCP).
