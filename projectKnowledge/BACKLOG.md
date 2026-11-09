# Backlog: what each deliverable left out, why, and the plan

Recorded 2026-11-08, after D12. Every item here was knowingly left out of a finished deliverable. Each one is
either assigned to a deliverable (D15–D17 were created for them; see `DELIVERABLES.md`) or explicitly not planned,
with the reason. When an item is done, mark it here and in `HANDOVER.md` "Known gaps".

## Left out, and why

| D | Left out | Why |
|---|---|---|
| D2 DC engine | Nothing significant (the "part not simulated yet" error has no test because every part is simulated now) | – |
| D3 Time simulation | ~~Adaptive time step~~ (done, D16c); ~~AC frequency analysis (Bode plots)~~ (done, D16d); ~~a fix for ringing when an inductor's switch opens~~ (done, D15a) | Fixed step is what CircuitJS1 does and was accurate to 0.003%; adaptive stepping is a large, separate project. Ringing is a known side-effect of the trapezoidal method (CircuitJS1 has it too) |
| D4 Diodes / transistors | ~~Burn-out warnings; per-colour LED models~~ (done, D15a; RGB LED D15c); transistor switching delays, Early effect, temperature; a fallback when the solver won't settle (partly done, D15a) | Not in D4's acceptance criteria, and each needs sourced data |
| D5 Logic | An event-driven engine; ~~gates with more than 2 inputs~~ (done, D16a); ~~tri-state outputs~~ (done, D16e) and multi-bit bus wires (D17) | Stepping logic with the analog solve (one step of delay) is simpler and is what CircuitJS1 does (ADR-018). Wider gates can be built by chaining 2-input ones |
| D6 App | ~~Joining a wire in its middle; copy/paste and multi-select; label overlap around a sideways battery~~ (all done, D15b) | The junction was in D6's scope and was missed. Several wires on one pin cover most cases, but it is a real gap. Copy/paste was not in the acceptance criteria |
| D7 AI tools | A remote (network) connection. ~~An AI tool for renaming a circuit~~ (done in D12a: `rename_circuit`) | Remote needs hosting (D14) |
| D8 Live link | ~~Reconnecting after a drop~~ (done, D15b); more than one learner at a time | The link lives as long as Claude Code runs. Several learners would need the D14 backend |
| D9 Oscilloscope + ICs | ~~Scope triggering, a separate scale per trace, X-Y mode, "show any part on the scope"~~ (done, D16e); ~~op-amp speed limits~~ (D16b); ~~ADC/DAC with more than 4 bits; an LED-style 7-segment display~~ (D16a) | Kept to the acceptance criteria. The 4-bit limit comes from the rule that a part's pins can't change with a setting (ADR-009) |
| D10 Saving | ~~Saving back over the same file on disk~~ (done, D11a); syncing across devices; ~~image export~~ (done, D15b) | Browser support for writing files in place is uneven, and syncing needs the D14 backend |
| D11a Desktop | Code signing and notarization; running the Windows/Linux CI builds; joining a live session from the desktop app (deep link); iOS; a signed release APK and Play Store listing | Signing needs paid developer accounts (Apple, a Windows certificate); CI needs a GitHub remote; a deep link needs a registered URL scheme and the MCP server allowing the Tauri origin; iOS needs full Xcode, not installed; a release APK needs a signing key kept outside the repo |
| Parts list "later" items | Net labels, subcircuits (custom chips), a parts browser with "request a part" (all D17). ~~Text notes~~ (done in D12b). Tapped transformer, DC motor (D16) | Assigned |

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

### D15c Audit fixes (from the 2026-11-08 audit, below)
| Item | How |
|---|---|
| ~~Autosave after a live session~~ (done) | Autosave the learner's copy once the link has dropped (it is their work now); test: link drops, edit, reload keeps it |
| ~~Picture crop~~ (done) | Bounds from each part's rotated body box, its labels and each note's drawn size, not origins |
| ~~Damaged saved circuit~~ (done) | Say so in the status bar and keep the damaged copy aside instead of overwriting it |
| ~~Shortcuts behind dialogs; Ctrl/⌘+C/A swallowed; Ctrl/⌘+R rotates~~ (done) | Ignore canvas shortcuts while a dialog is open or a button has focus; leave modified keys other than ours to the browser |
| ~~MCP file paths~~ (done) | `open_circuit` / `save_circuit` refuse paths outside the workspace folder |
| ~~Claims not enforced~~ (done) | RC golden at the claimed 0.003%, RLC within 1% at every point; op-amp at 0.03%; a typical-mistake test for every lesson; a square source simulated in a circuit |
| ~~RGB LED~~ (done, format v7) | One model and rating per colour (red, green, blue from the LED_MODELS); burn-out warnings per colour |
| ~~Missing tests~~ (done; the status bar now says "Paused" while paused) | Logic hold/reset cases, relay drop-out, settling triggers, MCP `remove_component`/`disconnect`, oversized live messages, library delete, rotate, pause, Ctrl/⌘+A, Escape |
| ~~Keyboard and screen readers~~ (done) | Parts and wires focusable and operable from the keyboard; status bar announces only problems and changes, not the time |
| ~~Touch~~ (done) | Larger invisible pin hit areas; drag/long-press threshold in screen pixels, sized for fingers |
| ~~Android template leftovers~~ (done) | Remove the TV launcher entry, template layout/colours/robot icon; dark icon background and splash |
| ~~Docs~~ (done) | HANDOVER counts and stale lines, ARCHITECTURE (SVG, dependency rule, app copy), COMPONENTS rows, README env vars, GLOSSARY terms, VISION levels |

### D16 Engine depth
| Item | How |
|---|---|
| ~~Adaptive time step~~ (done, D16c: step doubling; logic circuits stay fixed) | Local truncation error control as in SPICE; keep the fixed step as an option; golden tests must still pass |
| ~~AC analysis (Bode plot)~~ (done, D16d: `solveAc`, MCP `frequency_response`, oscilloscope Frequency view) | Small-signal analysis around the DC point with complex MNA; a frequency-sweep view; golden tests against ngspice `.ac` |
| ~~Transistor dynamics~~ (done, D16b; capacitances held constant, LEDs/β/Zener voltage not temperature-dependent) | Junction capacitances, Early effect and temperature (Gummel–Poon parameters); ngspice goldens |
| ~~Op-amp limits~~ (done, D16b, with the output current limit) | Slew rate and gain-bandwidth as parameters (CircuitJS1 keeps GBW in its format but does not simulate it) |
| ~~Wider gates~~ (done, D16a) | 3- and 4-input gate types (new types, so no format break) |
| ~~Tri-state and buses~~ (done, D16e: `tri-state-buffer`; outputs share a line, contention burns out). Multi-bit bus wires (one drawn line for many signals) move to D17 with net labels, which they need | A tri-state buffer type and bus wires; needs a "high impedance" output state in the logic model |
| ~~Wider converters~~ (done, D16a) | `adc-8bit` / `dac-8bit` as new types (pins stay fixed per type) |
| ~~LED 7-segment~~ (done, D16a) | `seven-segment-led` with a common pin and real LED segments, next to the logic display |
| ~~Scope upgrades~~ (done, D16e) | Trigger on a rising edge, per-trace scale, X-Y mode, and "watch this part" from the inspector without placing a probe |

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

### D18 Release (new, from the audit; signing, Android release and iOS set aside by the owner, 2026-11-09)
| Item | How |
|---|---|
| Public repo and hosting | A git remote (GitHub), the PWA hosted (static hosting), the licence and contribution notes |
| Desktop CI and signing | Run the existing workflow; macOS notarization and Windows signing when accounts exist |
| Android release | A signed release APK/AAB (key kept outside the repo), store listing |
| iOS | Needs full Xcode; same Tauri app |

### D19 Curriculum (new, from the audit)
| Item | How |
|---|---|
| More lessons and challenges | Lessons for levels 2–3 (op-amp, 555, flip-flops) and open challenges ("make it blink at 1 Hz"), each tested like the starters |
| Writing lessons | A documented lesson format and an MCP tool for the agent to draft one for review |

### Assigned by the audit to existing deliverables
| Item | Deliverable |
|---|---|
| ~~Ratings for Zener, transistors~~ (done, D16a); op-amp output current limit (D16b) | D16 |
| ~~Tapped transformer~~ (done, D16a), ~~DC motor~~ (done, D16e) | D16 |
| Wiring from the keyboard (pins are not in the Tab order) | D16 |
| Redo; group rotate; notes in box select and copy/paste; library delete confirmation; manual Reconnect and telling the learner when offline edits are replaced; palette arrow keys; slider label; PWA manifest `id`, separate maskable icons | D16 (app items alongside) |
| AI from the Android app or the desktop app (deep link, remote MCP) | D14 |
| Accessibility audit with a screen reader; other languages | D18 |

### Not planned
| Item | Why |
|---|---|
| Event-driven logic engine | Stepping logic with the analog solve is exact enough for teaching and is what CircuitJS1 does; revisit only if large digital circuits become slow (ADR-018) |

## Audit 2026-11-08 (before D16)
Four read-only reviews checked every acceptance item against code and tests, plus VISION, ARCHITECTURE and the docs;
findings were verified in the code before recording. Summary (details in the D15c, D18, D19 tables above):
- Bugs: no autosave after a live session (work lost on reload); picture export crops parts, labels and notes; a damaged
  saved circuit is dropped silently and overwritten; shortcuts edit the circuit behind open dialogs; MCP file tools
  accept paths outside the workspace.
- Claims stricter than their tests: RC 0.003% (tested 1%), RLC "within 1%" (200 µs point 0.1 V), op-amp 0.03%
  (tested 0.05%), "every lesson catches a typical mistake" (2 of 5), square source "simulated" (no circuit test).
- Model gaps: RGB LED uses the red model for every colour and has no rating; no ratings for Zener, transistors, op-amp.
- Untested: logic hold/reset cases, relay drop-out, settling triggers other than a switch, two MCP tools, oversized
  live messages, several app actions.
- Access: canvas not keyboard-operable; status bar announces the time every frame; pins too small for touch.
- Docs: tool counts, PixiJS, stale statuses and lines across HANDOVER, ARCHITECTURE, COMPONENTS, BACKLOG, VISION, README.
- Not covered by any deliverable before the audit: publishing/hosting, iOS/signing (now D18), challenges and more
  lessons (now D19), the AI from mobile (D14), accessibility and languages (D18).
