# Backlog: what each deliverable left out, why, and the plan

Recorded 2026-11-08, after D12. Every item here was knowingly left out of a finished deliverable. Each one is
either assigned to a deliverable (D15–D17 were created for them; see `DELIVERABLES.md`) or explicitly not planned,
with the reason. When an item is done, mark it here and in `HANDOVER.md` "Known gaps".

## Left out, and why

| D | Left out | Why |
|---|---|---|
| D2 DC engine | Nothing significant | – |
| D3 Time simulation | Adaptive time step (fixed step only); AC frequency analysis (Bode plots); a fix for ringing when an inductor's switch opens | Fixed step is what CircuitJS1 does and was accurate to 0.003%; adaptive stepping is a large, separate project. Ringing is a known side-effect of the trapezoidal method (CircuitJS1 has it too) |
| D4 Diodes / transistors | Burn-out warnings; per-colour LED models (blue/white should be about 3 V, ours are 1.8 V); transistor switching delays, Early effect, temperature; a fallback when the solver won't settle | Not in D4's acceptance criteria, and each needs sourced data |
| D5 Logic | An event-driven engine; gates with more than 2 inputs; tri-state outputs and buses | Stepping logic with the analog solve (one step of delay) is simpler and is what CircuitJS1 does (ADR-018). Wider gates can be built by chaining 2-input ones |
| D6 App | Joining a wire in its middle (wires only go pin to pin); copy/paste and multi-select; label overlap around a sideways battery | The junction was in D6's scope and was missed. Several wires on one pin cover most cases, but it is a real gap. Copy/paste was not in the acceptance criteria |
| D7 AI tools | A remote (network) connection. ~~An AI tool for renaming a circuit~~ (done in D12a: `rename_circuit`) | Remote needs hosting (D14) |
| D8 Live link | Reconnecting after a drop; more than one learner at a time | The link lives as long as Claude Code runs. Several learners would need the D14 backend |
| D9 Oscilloscope + ICs | Scope triggering, a separate scale per trace, X-Y mode, "show any part on the scope"; op-amp speed limits (slew rate, bandwidth); ADC/DAC with more than 4 bits; an LED-style 7-segment display | Kept to the acceptance criteria. The 4-bit limit comes from the rule that a part's pins can't change with a setting (ADR-009) |
| D10 Saving | Saving back over the same file on disk; syncing across devices; image export | Browser support for writing files in place is uneven, and syncing needs the D14 backend |
| D11a Desktop | Code signing and notarization; running the Windows/Linux CI builds; joining a live session from the desktop app (deep link); iOS | Signing needs paid developer accounts (Apple, a Windows certificate); CI needs a GitHub remote; a deep link needs a registered URL scheme and the MCP server allowing the Tauri origin; iOS needs full Xcode, not installed |
| Parts list "later" items | Net labels, subcircuits (custom chips), a parts browser with "request a part". ~~Text notes~~ (done in D12b) | Not assigned to any deliverable yet |

## The plan

Ordered by value to a learner. **D15 is recommended before D11**, because the desktop and mobile builds package
whatever the app is at that point.

### D15 Learner polish (correctness and everyday use)
| Item | How |
|---|---|
| ~~Mid-wire junction~~ (done, D15b) | A `junction` part (one pin, any number of wires) placed by clicking a wire, which splits it in two; no format change beyond the new part |
| ~~Burn-out warnings~~ (done, D15a) | Rated limits as part parameters (LED max current, resistor and lamp power, diode max current) with sourced defaults; a plain warning naming the part and the value, like the polarized-capacitor warning |
| ~~Per-colour LED models~~ (done, D15a) | One diode model per colour from sourced datasheet or SPICE data (red about 1.8 V, green about 2.1 V, blue and white about 3 V); default params picked by `color` |
| ~~Label overlap~~ (done, D15b) | Place a part's value and reading on the side away from its node labels; tested with a screenshot check of a sideways battery |
| ~~Copy / paste, multi-select~~ (done, D15b) | Box select and Shift-click; copy/paste as new `add-component` + `connect` commands (one undo step via a command batch) |
| ~~Live-link reconnect~~ (done, D15b) | The app retries the same address with back-off; the MCP server can keep a fixed port and token from env, so a restarted server is found again |
| ~~Image export~~ (done, D15b) | Download the canvas as SVG (it already is SVG) and PNG |
| ~~Inductor ringing~~ (done, D15a: ten settling steps, ADR-023) | Use one backward-Euler step whenever a switch changes state (what SPICE does at breakpoints); tested on an inductor switched off |
| Solver fallback | Partly done (D15a): runaway current is now diagnosed by name. gmin / source stepping deferred until a circuit that fails to settle turns up (none found) |

### D16 Engine depth
| Item | How |
|---|---|
| Adaptive time step | Local truncation error control as in SPICE; keep the fixed step as an option; golden tests must still pass |
| AC analysis (Bode plot) | Small-signal analysis around the DC point with complex MNA; a frequency-sweep view; golden tests against ngspice `.ac` |
| Transistor dynamics | Junction capacitances, Early effect and temperature (Gummel–Poon parameters); ngspice goldens |
| Op-amp limits | Slew rate and gain-bandwidth as parameters (CircuitJS1 keeps GBW in its format but does not simulate it) |
| Wider gates | 3- and 4-input gate types (new types, so no format break) |
| Tri-state and buses | A tri-state buffer type and bus wires; needs a "high impedance" output state in the logic model |
| Wider converters | `adc-8bit` / `dac-8bit` as new types (pins stay fixed per type) |
| LED 7-segment | `seven-segment-led` with a common pin and real LED segments, next to the logic display |
| Scope upgrades | Trigger on a rising edge, per-trace scale, X-Y mode, and "watch this part" from the inspector without placing a probe |

### D17 Building bigger
| Item | How |
|---|---|
| Net labels | A `net-label` part: pins with the same label are one node |
| Subcircuits | Save a circuit as a reusable part with chosen pins (SPICE `X`); a format change and a migration |
| Parts browser + "request a part" | Browse all parts; the AI drafts a `COMPONENTS.md` row and `defineComponent` entry from a request with sources, for review |

### Assigned to existing deliverables
| Item | Deliverable | How |
|---|---|---|
| ~~Save in place to disk~~ (done, D11a) | D11 | Native file dialogs in the desktop app; in the browser, the File System Access API where supported, with download as the fallback |
| Remote MCP connection | D14 | Streamable HTTP transport behind the backend's accounts |
| Several learners on one circuit | D14 | The shared document moves to the server |
| Cross-device sync | D14 | Library entries stored per account |

### Not planned
| Item | Why |
|---|---|
| Event-driven logic engine | Stepping logic with the analog solve is exact enough for teaching and is what CircuitJS1 does; revisit only if large digital circuits become slow (ADR-018) |
