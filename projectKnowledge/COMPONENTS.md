# Component inventory

Every part the app will support up to scope level 3, plus what was considered and left out.
Status: `in format` (defined in `packages/format`) · `simulated` (engine model, or a display/recorder's behaviour, covered by tests; golden tests against ngspice or textbook answers where the row says so) · `planned`.
Units are SI. Pin names are lowercase words. Parameter names are ours; defaults are confirmed by the owning deliverable's golden test.

**One stored value per quantity.** The file stores one canonical value; the UI and MCP accept equivalent forms and convert, and display both. Frequency (Hz) is stored, and period (s) = 1/frequency is accepted and shown. A sine's amplitude (peak V) is stored, and RMS = amplitude/√2 is accepted and shown. Storing both would let them disagree.

## Sources (checked 2026-11-07)
| Key | Source | What it gave us |
|---|---|---|
| EC | Owner's screenshots of the EveryCircuit parts toolbar (`WorkSpaceImage/`, local only, not committed) | Which parts a learning simulator offers. Observed features only (ADR-001). Icon readings marked `?` are my interpretation |
| CJS | CircuitJS1 `ts/Menus.ts`, `ts/DiodeModel.ts`, `ts/LEDElm.ts`, `ts/TransistorModel.ts` (github.com/pfalstad/circuitjs1, master) | Full parts menu and default models |
| SPICE | ngspice HTML manual, v47+ (Mar 2026), Table 2.2 element letters, §4.1 source waveforms, §7.2 diode, §7.3 BJT | Standard element set and parameter names/defaults |
| KB | Kingbright datasheets: 5 mm single-colour LEDs (blue L-7113QBC-D; white L-7113MWC, discontinued listing), and WP154A4SUREQBFZGW full-colour LED (spec DSAJ8688 V.12A, 2024-11-01), SC56-11EWA 0.56" red 7-segment (spec DSAP6671 V.1A, 2019-03-04) | LED forward voltages at 20 mA and maximum DC currents (ADR-023, ADR-027) |
| DS | Small-signal datasheets: Vishay 1N4728A–1N4761A (doc 85816 Rev. 2.7, 2024-11-07), onsemi 2N3903/2N3904 (Rev. 9, 2021-08) and 2N3906 (Rev. 4, 2010-02), Diodes Inc. 2N7002 (DS11303 Rev. 33) and BSS84 (DS30149 Rev. 27) | Ratings of the Zener, transistors and MOSFETs (ADR-029) |
| TI | TI LM741 datasheet (SNOSC25D, revised Oct 2015) | Op-amp slew rate, output short-circuit current, gain-bandwidth from rise time (ADR-031) |
| SM | Manufacturer SPICE models: onsemi 2N3904 (MODPEX, 2001-08-07), Fairchild/onsemi 2N7002 (Rev. 0.0, 2007-11-05) | Transistor Early voltage, junction capacitances and transit times; MOSFET gate capacitances (ADR-031) |

## Reference and sources
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `ground` | terminal | – | 0 V reference node | EC, CJS | D2 | simulated |
| `voltage-source` (DC) | positive, negative | voltage (V) | ideal voltage source | EC, CJS, SPICE `V` | D2 | simulated |
| `current-source` | positive, negative | current (A), flows out of `positive` | ideal current source | EC, CJS, SPICE `I` | D2 | simulated |
| `vcvs` | controlPositive, controlNegative, positive, negative | gain (V/V) | voltage-controlled voltage source | EC, CJS, SPICE `E` | D3 | simulated |
| `vccs` | controlPositive, controlNegative, positive, negative | transconductance (S = A/V) | voltage-controlled current source; output current flows out of `positive` (like `current-source`; SPICE G is the reverse) | EC, CJS, SPICE `G` | D3 | simulated |
| `ccvs` | senseIn, senseOut, positive, negative | transresistance (Ω) | current through sense pins (0 V path) controls voltage | EC, CJS, SPICE `H` | D3 | simulated |
| `cccs` | senseIn, senseOut, positive, negative | gain (A/A) | current through sense pins controls current, out of `positive` | EC, CJS, SPICE `F` | D3 | simulated |
| `voltage-rail` | terminal | voltage (V) | source to ground drawn as one pin (e.g. +5 V) | CJS | D5 | simulated |
| `ac-source` | positive, negative | amplitude (peak V; RMS accepted), frequency (Hz; period accepted), offset (V), phase (deg), delay (s) | sine, SPICE `SIN(VO VA FREQ TD THETA PHASE)` without damping; DC value = offset | EC, CJS, SPICE | D3 | simulated |
| `square-source` | positive, negative | low (V), high (V), frequency (Hz; period accepted), dutyCycle (0–1) | pulse, SPICE `PULSE` with instant edges, high first; DC value = low | CJS, SPICE | D3 | simulated |
| `clock` | out | frequency (Hz; period accepted), dutyCycle | logic square wave | EC (Logic Train), CJS | D5 | simulated |

## Passive
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `resistor` | a, b | resistance (Ω), powerRating (W, default ¼ W) | Ohm's law; burn-out above its power rating | EC, CJS, SPICE `R` | D2 | simulated |
| `capacitor` | a, b | capacitance (F) | companion model (trapezoidal; backward Euler first step) | EC, CJS, SPICE `C` | D3 | simulated |
| `polarized-capacitor` | positive, negative | capacitance (F), maxReverseVoltage (V, default 1 as CJS) | capacitor; warns when reversed past the limit (CJS stops the simulation) | EC, CJS | D3 | simulated |
| `inductor` | a, b | inductance (H) | companion model (trapezoidal; backward Euler first step) | EC, CJS, SPICE `L` | D3 | simulated |
| `potentiometer` | a, b, wiper | resistance (Ω), position (0–1) | two resistors split at the wiper (a wire at an end stop) | EC, CJS | D3 | simulated |
| `junction` | terminal | – | no model: a dot where wires join; placed by clicking a wire, which splits it in two (`split-wire`) | CJS (wires join anywhere) | D15 | simulated |
| `transformer` | primaryA, primaryB, secondaryA, secondaryB | primaryInductance (H), turnsRatio, coupling (0–1, exclusive: k = 1 makes the inductance matrix singular) | coupled inductors, SPICE `K`; defaults 4 H, 1, 0.999 as CJS; windings are wires at DC | EC, CJS, SPICE `K` | D3 | simulated |
| `tapped-transformer` | primaryA, primaryB, secondaryA, secondaryTap, secondaryB | as transformer; turnsRatio is the whole secondary | three coupled windings (primary and two halves of n/2 turns), every pair coupled k; vs ngspice K within 1% | EC, CJS | D16 | simulated |
| `lamp` | a, b | ratedVoltage (V), ratedPower (W) | resistor R = V²/P; brightness from power. Defaults 6 V / 1 W (CJS: 120 V / 100 W mains lamp with a heating filament; ours is fixed-resistance so a 5 V source lights it) | EC, CJS | D3 | simulated |
| `dc-motor` | a, b | resistance (Ω), inductance (H), back-EMF constant | electrical + simple rotation model | EC, CJS | later | planned |

## Switches
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `switch` (SPST) | a, b | closed | ideal: a wire (0 V branch) when closed, nothing when open; so a closed switch across a source is a short circuit | EC, CJS | D2 | simulated |
| `switch-spdt` | common, a, b | position (a/b) | common wired to the selected pin; click flips it | EC, CJS | D3 | simulated |
| `push-button` | a, b | normallyOpen (true = NO, false = NC) | switch, toggles while pressed (held state is an engine input, never saved) | EC (NO and NC), CJS | D6 | simulated |
| `relay` | coilA, coilB, common, normallyOpen, normallyClosed | coilInductance (H), coilResistance (Ω), onCurrent (A), offCurrent (A); CJS defaults 0.2 H, 20 Ω, 20 mA, 15 mA | series RL coil; contacts flip with hysteresis | EC, CJS | D9 | simulated |

## Semiconductors
Diode-family params follow SPICE §7.2 names and meanings (SPICE's own defaults: IS 1e-14 A, N 1, RS 0 Ω, BV none). Our defaults are CircuitJS1's models and the sourced LED models, given in each row (the plain diode: IS 1.714e-7 A, N 2, RS 0). The UI may also offer "forward voltage at a current" and convert, as CJS does.

| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `diode` | anode, cathode | diode-family params, maxCurrent (A, default 1 A as 1N4001–1N4007) | Shockley equation, Newton–Raphson. CJS default: IS 1.714e-7, N 2 (≈0.81 V at 1 A) | EC, CJS, SPICE `D` | D4 | simulated |
| `zener-diode` | anode, cathode | diode-family + breakdownVoltage (CJS default 5.6 V) + maxCurrent (162 mA, 1N4734A IZM) | diode with reverse breakdown | EC, CJS, SPICE `D` (BV) | D4 | simulated |
| `led` | anode, cathode | color, diode-family params (per colour, `LED_MODELS`, Kingbright 5 mm Vf at 20 mA), maxCurrent (30 mA, green 25 mA), maxBrightnessCurrent (CJS 10 mA) | diode + brightness. CJS default: IS 93.2e-12, RS 0.042, N 3.73 (≈2.23 V at 1 A), red | EC, CJS | D4 | simulated |
| `rgb-led` | red, green, blue, common | commonCathode, N and RS (shared), IS per colour, max current per colour | three LEDs sharing one pin, red on the red LED model, green and blue on the InGaN (3.3 V) model; colours mix; burn-out per colour (format v7) | EC, KB | D4, D15c | simulated |
| `npn-transistor` | collector, base, emitter | beta (SPICE BF default 100), betaReverse (BR 1), saturationCurrent (IS: SPICE 1e-16, CJS 1e-13), maxCurrent (200 mA) and maxPower (625 mW) as 2N3904 | Ebers–Moll with Gummel–Poon's forward Early effect (VAF 1000 V), stored charge (CJE, CJC held at zero bias; TF, TR) and temperature, from onsemi's 2N3904 model; vs ngspice | EC, CJS, SPICE `Q` | D4 | simulated |
| `pnp-transistor` | collector, base, emitter | as NPN (ratings as 2N3906: 200 mA, 625 mW) | Ebers–Moll | EC, CJS, SPICE `Q` | D4 | simulated |
| `n-mosfet` | drain, gate, source | thresholdVoltage (V), transconductance (A/V²), maxCurrent (170 mA) and maxPower (370 mW) as 2N7002 | square-law (SPICE level 1, λ = 0, as Fairchild's 2N7002 model has none); gate capacitances Cgs 16 pF, Cgd 46 pF (held at its maximum); defaults 1.5 V, 0.02 A/V² (CJS MosfetElm) | EC, CJS, SPICE `M` | D4 | simulated |
| `p-mosfet` | drain, gate, source | as N-MOSFET (ratings as BSS84: 130 mA, 300 mW) | square-law | EC, CJS, SPICE `M` | D4 | simulated |

## Digital logic
Gates have fixed inputs: 2 for most, 1 for NOT. Wider gates are built by chaining. Logic level comes from the logic-family setting (see "Not a component").

| Type | Pins | Params | Seen in | Deliverable | Status |
|---|---|---|---|---|---|
| `logic-input` (toggle) | out | high | EC (Logic Source), CJS | D5 | simulated |
| `logic-output` (indicator) | in | – | CJS | D5 | simulated |
| `not-gate` | in, out | – | EC, CJS (Inverter) | D5 | simulated |
| `and-gate`, `or-gate`, `nand-gate`, `nor-gate`, `xor-gate`, `xnor-gate` | a, b, out | – | EC, CJS | D5 | simulated |
| `and-gate-3`, `and-gate-4`, `or-gate-3`, `or-gate-4`, `nand-gate-3`, `nand-gate-4`, `nor-gate-3`, `nor-gate-4` | a, b, c (, d), out | – (widths sold as chips: 74HC11/21, 4075/4072, 10/20, 27/4002; id prefixes ANDT/ANDQ…) | CJS (gates with N inputs) | D16 | simulated |
| `sr-latch` (NOR, active-high) | s, r, q, qNot | – | EC | D5 | simulated |
| `sr-latch-inverted` (NAND, active-low S̄R̄) | sNot, rNot, q, qNot | – | EC | D5 | simulated |
| `d-flip-flop` | d, clk, q, qNot | – | EC, CJS | D5 | simulated |
| `t-flip-flop` | t, clk, q, qNot | – | EC, CJS | D5 | simulated |
| `jk-flip-flop` | j, clk, k, q, qNot | – | EC, CJS | D5 | simulated |
| `counter-4bit` | clk, reset, q0, q1, q2, q3 | – | EC, CJS | D5 | simulated |

Half and full adders are not parts. Learners build them from gates (lessons in D12). CJS has them as chips; revisit with subcircuits.

## ICs, converters and displays
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `op-amp` | nonInverting, inverting, output | gain (CJS 100000), supplyHigh/Low (±15 V), gainBandwidth (1.17 MHz), slewRate (0.5 V/µs), maxOutputCurrent (25 mA): LM741 | smooth rail limit; over time one pole (GBW, vs ngspice within 1%) and a slew limit; output current limit as a mode switch | EC, CJS, TI | D9, D16 | simulated |
| `timer-555` | ground, trigger, output, reset, control, threshold, discharge, vcc | – | comparators + SR latch + discharge transistor | EC, CJS | D9 | simulated |
| `seven-segment` | a, b, c, d, e, f, g, dp | – | logic display (CJS default): a segment lights at logic 1. LED-accurate version: `seven-segment-led` | EC, CJS | D9 | simulated |
| `bcd-to-seven-segment` | d0, d1, d2, d3, a, b, c, d, e, f, g | – | logic decoder, CJS table incl. A–F | EC, CJS | D9 | simulated |
| `adc-4bit` | in, vref, d0…d3 | – (fixed 4 bits, ADR-020) | trunc(15·Vin/Vref), as CJS | EC, CJS | D9 | simulated |
| `dac-4bit` | d0…d3, vref, out | – (fixed 4 bits) | code·Vref/15 | EC, CJS | D9 | simulated |
| `adc-8bit`, `dac-8bit` | in, vref, d0…d7 / d0…d7, vref, out | – (fixed 8 bits; prefixes ADCB, DACB) | truncating 255·Vin/Vref; code·Vref/255 | CJS (any width) | D16 | simulated |
| `seven-segment-led` | a…g, dp, common | commonCathode, diode-family (IS fitted to 1.9 V at 10 mA), maxCurrent (30 mA), maxBrightnessCurrent | eight LEDs sharing a pin, as Kingbright SC56-11EWA; burn-out per segment | EC, KB | D16 | simulated |

## Measurement
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `voltmeter` | positive, negative | – | open circuit, reads voltage (CJS `ProbeElm`, infinite resistance) | EC, CJS | D6 | simulated |
| `ammeter` | positive, negative | – | 0 V source, reads current (CJS `AmmeterElm`); across a battery it is a short circuit | EC, CJS | D6 | simulated |
| `ohmmeter` | a, b | – | 1 mA test current out of `a`, reads V/I (CJS `OhmMeterElm`); "OL (open)" with nothing between its leads; warns on a powered circuit; needs no ground | EC, CJS | D6 | simulated |
| `scope-probe` | positive, negative | – (one trace per probe, named by id) | records voltage over time | CJS (Voltmeter/Scope Probe) | D9 | simulated |

## Not a component, but needed
| Item | Why | Seen in | Deliverable |
|---|---|---|---|
| Junction | A `junction` part (one pin, any number of wires, no model) placed by clicking a wire, which splits it in two | CJS (wires join anywhere) | done (D15b) |
| Labeled node (net label, e.g. "VCC") | Connect distant points by name | CJS | D17 |
| Text notes | Lessons and AI explanations (separate `notes` list, format v5) | CJS | done (D12) |
| Simulation settings | Time step, speed (D3), logic high voltage (D5); saved with the circuit | SPICE (TSTEP/TSTOP), CJS | done |
| Subcircuits ("custom chips") | Learner builds a half adder, saves it as a reusable part | CJS, SPICE `X`, EC `+` | D17 |
| Parts browser + "request a new part" | Browse all parts; request a missing one with an explanation and sources, which the AI drafts into a `COMPONENTS.md` row + `defineComponent` entry for review | EC `+` | D17 |

## Considered and left out (for now)
From CJS / SPICE, not in EC: battery (covered by `voltage-source`; internal resistance could be added later), DPDT and make-before-break switches, analog switches, transmission lines (SPICE `T`/`O`), photoresistor, thermistor, memristor, spark gap, fuse, crystal, gyrator, AM/FM/noise/audio sources, antenna, JFET (SPICE `J`), MESFET (`Z`), SCR, DIAC, TRIAC, Darlington, varactor, tunnel diode, triode, UJT, real op-amp, comparator, Schmitt trigger, OTA, CCII, optocoupler, LM317, TL431, buffers (tri-state buffers are planned in D16), multiplexers, shift registers, RAM/ROM, VCO, phase comparator, monostable, wattmeter, 3-phase motor, LED array, behavioural source (SPICE `B`), microcontrollers (D13). Add any of them with the checklist below.

## Reference screenshot readings (confirmed by owner, 2026-11-07)
- LED icon with bars beneath: RGB LED → `rgb-led`.
- Circle icons: AC voltage source (Hz) → `ac-source`; DC voltage source (V) → `voltage-source`; current source; voltmeter; ammeter; ohmmeter; Logic Source → `logic-input`; Logic Train → `clock`; lamp; DC motor.
- `=1` with a bubble: NOT gate.
- Yellow `+`: more parts / custom parts / request a new part with explanation and sources.

## How to add a component
1. Add a row to this file (pins, params with units, model, seen in, deliverable).
2. Add one `defineComponent(type, { idPrefix, pins, params })` entry in the matching category file in `packages/format/src/schema/components/` (`sources`, `passives`, `switches`, `semiconductors`, `logic`, `ics`, `measurement`). `idPrefix` gives automatic ids (R1, R2…). Describe each param with its unit (`positive("ohms")`, `.describe(...)`): the AI reads these. For a new category, add a file and spread it into `catalog.ts`.
3. Add format tests for valid and invalid params in `packages/format/test/`.
4. No format version bump for a **new** type: older apps report "Unknown component type ... update the app". Changing an **existing** part's pins or params needs a version bump plus a migration that fills defaults (ADR-008).
5. Add the part to `DC_MODELS` in `packages/engine/src/dc/branches.ts` (TypeScript fails until you do): a model, or `"not-simulated"` until its deliverable. The engine model ships with a golden test, then status becomes `simulated`.
6. Place its pins: add an entry to `PIN_OFFSETS` in `packages/format/src/layout/pins.ts` (TypeScript fails until you do; a test checks the names match the catalog). The app draws wires to these points and the MCP reports them to agents.
7. Draw it: add its symbol to `SYMBOLS` and its display name to `PART_NAMES` in `apps/web/src/app/circuit/symbols.ts` (the build fails until you do); the symbol's leads should end at the pin offsets. Give `defaults` in step 2 so it can be placed with one click.
