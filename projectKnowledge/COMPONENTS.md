# Component inventory

Every part the app will support up to scope level 3, plus what was considered and left out.
Status: `in format` (defined in `packages/format`) · `simulated` (engine model + golden test) · `planned`.
Units are SI. Pin names are lowercase words. Parameter names are ours; defaults are confirmed by the owning deliverable's golden test.

**One stored value per quantity.** The file stores one canonical value; the UI and MCP accept equivalent forms and convert, and display both. Frequency (Hz) is stored, and period (s) = 1/frequency is accepted and shown. A sine's amplitude (peak V) is stored, and RMS = amplitude/√2 is accepted and shown. Storing both would let them disagree.

## Sources (checked 2026-11-07)
| Key | Source | What it gave us |
|---|---|---|
| EC | Owner's screenshots of the EveryCircuit parts toolbar (`WorkSpaceImage/`, local only, not committed) | Which parts a learning simulator offers. Observed features only (ADR-001). Icon readings marked `?` are my interpretation |
| CJS | CircuitJS1 `ts/Menus.ts`, `ts/DiodeModel.ts`, `ts/LEDElm.ts`, `ts/TransistorModel.ts` (github.com/pfalstad/circuitjs1, master) | Full parts menu and default models |
| SPICE | ngspice HTML manual, v47+ (Mar 2026), Table 2.2 element letters, §4.1 source waveforms, §7.2 diode, §7.3 BJT | Standard element set and parameter names/defaults |

## Reference and sources
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `ground` | terminal | – | 0 V reference node | EC, CJS | D2 | in format |
| `voltage-source` (DC) | positive, negative | voltage (V) | ideal voltage source | EC, CJS, SPICE `V` | D2 | in format |
| `current-source` | positive, negative | current (A), flows out of `positive` | ideal current source | EC, CJS, SPICE `I` | D2 | in format |
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
| `resistor` | a, b | resistance (Ω) | Ohm's law | EC, CJS, SPICE `R` | D2 | in format |
| `capacitor` | a, b | capacitance (F) | companion model (trapezoidal; backward Euler first step) | EC, CJS, SPICE `C` | D3 | simulated |
| `polarized-capacitor` | positive, negative | capacitance (F), maxReverseVoltage (V, default 1 as CJS) | capacitor; warns when reversed past the limit (CJS stops the simulation) | EC, CJS | D3 | simulated |
| `inductor` | a, b | inductance (H) | companion model (trapezoidal; backward Euler first step) | EC, CJS, SPICE `L` | D3 | simulated |
| `potentiometer` | a, b, wiper | resistance (Ω), position (0–1) | two resistors split at the wiper (a wire at an end stop) | EC, CJS | D3 | simulated |
| `transformer` | primaryA, primaryB, secondaryA, secondaryB | primaryInductance (H), turnsRatio, coupling (0–1, exclusive: k = 1 makes the inductance matrix singular) | coupled inductors, SPICE `K`; defaults 4 H, 1, 0.999 as CJS; windings are wires at DC | EC, CJS, SPICE `K` | D3 | simulated |
| `tapped-transformer` | primaryA, primaryB, secondaryA, secondaryTap, secondaryB | as transformer | coupled inductors, centre tap | EC, CJS | later | planned |
| `lamp` | a, b | ratedVoltage (V), ratedPower (W) | resistor R = V²/P; brightness from power. Defaults 6 V / 1 W (CJS: 120 V / 100 W mains lamp with a heating filament; ours is fixed-resistance so a 5 V source lights it) | EC, CJS | D3 | simulated |
| `dc-motor` | a, b | resistance (Ω), inductance (H), back-EMF constant | electrical + simple rotation model | EC, CJS | later | planned |

## Switches
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `switch` (SPST) | a, b | closed | tiny / huge resistance | EC, CJS | D2 | in format |
| `switch-spdt` | common, a, b | position (a/b) | common wired to the selected pin; click flips it | EC, CJS | D3 | simulated |
| `push-button` | a, b | normallyOpen (true = NO, false = NC) | switch, toggles while pressed (held state is an engine input, never saved) | EC (NO and NC), CJS | D6 | simulated |
| `relay` | coilA, coilB, common, normallyOpen, normallyClosed | coilVoltage (V), coilResistance (Ω) | coil current drives switch | EC, CJS | D9 | planned |

## Semiconductors
Diode-family params follow SPICE §7.2: saturationCurrent (IS, default 1e-14 A), emissionCoefficient (N, default 1), seriesResistance (RS, default 0 Ω), breakdownVoltage (BV, default none). The UI may also offer "forward voltage at a current" and convert, as CJS does.

| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `diode` | anode, cathode | diode-family params | Shockley equation, Newton–Raphson. CJS default: IS 1.714e-7, N 2 (≈0.81 V at 1 A) | EC, CJS, SPICE `D` | D4 | simulated |
| `zener-diode` | anode, cathode | diode-family + breakdownVoltage (CJS default 5.6 V) | diode with reverse breakdown | EC, CJS, SPICE `D` (BV) | D4 | simulated |
| `led` | anode, cathode | color, diode-family params, maxBrightnessCurrent (CJS 10 mA); every colour uses CJS's one LED model for now | diode + brightness. CJS default: IS 93.2e-12, RS 0.042, N 3.73 (≈2.23 V at 1 A), red | EC, CJS | D4 | simulated |
| `rgb-led` | red, green, blue, common | commonCathode, diode-family params per colour | three LEDs sharing one pin; colours mix | EC | D4 | simulated |
| `npn-transistor` | collector, base, emitter | beta (SPICE BF default 100), betaReverse (BR 1), saturationCurrent (IS: SPICE 1e-16, CJS 1e-13) | Ebers–Moll (SPICE level 1 reduces to it) | EC, CJS, SPICE `Q` | D4 | simulated |
| `pnp-transistor` | collector, base, emitter | as NPN | Ebers–Moll | EC, CJS, SPICE `Q` | D4 | simulated |
| `n-mosfet` | drain, gate, source | thresholdVoltage (V), transconductance (A/V²) | square-law (SPICE level 1, λ = 0); defaults 1.5 V, 0.02 A/V² (CJS MosfetElm) | EC, CJS, SPICE `M` | D4 | simulated |
| `p-mosfet` | drain, gate, source | as N-MOSFET | square-law | EC, CJS, SPICE `M` | D4 | simulated |

## Digital logic
Gates have fixed inputs: 2 for most, 1 for NOT. Wider gates are built by chaining. Logic level comes from the logic-family setting (see "Not a component").

| Type | Pins | Params | Seen in | Deliverable | Status |
|---|---|---|---|---|---|
| `logic-input` (toggle) | out | high | EC (Logic Source), CJS | D5 | simulated |
| `logic-output` (indicator) | in | – | CJS | D5 | simulated |
| `not-gate` | in, out | – | EC, CJS (Inverter) | D5 | simulated |
| `and-gate`, `or-gate`, `nand-gate`, `nor-gate`, `xor-gate`, `xnor-gate` | a, b, out | – | EC, CJS | D5 | simulated |
| `sr-latch` (NOR, active-high) | s, r, q, qNot | – | EC | D5 | simulated |
| `sr-latch-inverted` (NAND, active-low S̄R̄) | sNot, rNot, q, qNot | – | EC | D5 | simulated |
| `d-flip-flop` | d, clk, q, qNot | – | EC, CJS | D5 | simulated |
| `t-flip-flop` | t, clk, q, qNot | – | EC, CJS | D5 | simulated |
| `jk-flip-flop` | j, k, clk, q, qNot | – | EC, CJS | D5 | simulated |
| `counter-4bit` | clk, reset, q0, q1, q2, q3 | – | EC, CJS | D5 | simulated |

Half and full adders are not parts. Learners build them from gates (lessons in D12). CJS has them as chips; revisit with subcircuits.

## ICs, converters and displays
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `op-amp` (ideal) | nonInverting, inverting, output | gain, supplyHigh (V), supplyLow (V) | high-gain VCVS, output clamped to rails | EC, CJS | D9 | planned |
| `timer-555` | ground, trigger, output, reset, control, threshold, discharge, vcc | – | comparators + SR latch + discharge transistor | EC, CJS | D9 | planned |
| `seven-segment` | a, b, c, d, e, f, g, dp, common | commonCathode | 8 LEDs | EC, CJS | D9 | planned |
| `bcd-to-seven-segment` | d0, d1, d2, d3, a, b, c, d, e, f, g | – | logic decoder | EC, CJS | D9 | planned |
| `adc` | in, vref, clk?, d0…dN | bits, referenceVoltage | sample + quantise | EC, CJS | D9 | planned |
| `dac` | d0…dN, vref, out | bits, referenceVoltage | weighted sum | EC, CJS | D9 | planned |

## Measurement
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `voltmeter` | positive, negative | – | open circuit, reads voltage (CJS `ProbeElm`, infinite resistance) | EC, CJS | D6 | simulated |
| `ammeter` | positive, negative | – | 0 V source, reads current (CJS `AmmeterElm`); across a battery it is a short circuit | EC, CJS | D6 | simulated |
| `ohmmeter` | a, b | – | 1 mA test current out of `a`, reads V/I (CJS `OhmMeterElm`); "OL (open)" with nothing between its leads; warns on a powered circuit; needs no ground | EC, CJS | D6 | simulated |
| `scope-probe` | positive, negative | channel, label | records voltage over time | CJS (Voltmeter/Scope Probe) | D9 | planned |

## Not a component, but needed
| Item | Why | Seen in | Deliverable |
|---|---|---|---|
| Junction | Wires connect pin to pin only today; joining mid-wire needs a junction | CJS (wires join anywhere) | D6 |
| Labeled node (net label, e.g. "VCC") | Connect distant points by name | CJS | later |
| Text notes | Lessons and AI explanations (separate `annotations` list) | CJS | D12 |
| Simulation settings | Time step, speed (D3), logic high voltage (D5); saved with the circuit | SPICE (TSTEP/TSTOP), CJS | done |
| Subcircuits ("custom chips") | Learner builds a half adder, saves it as a reusable part | CJS, SPICE `X`, EC `+` | later |
| Parts browser + "request a new part" | Browse all parts; request a missing one with an explanation and sources, which the AI drafts into a `COMPONENTS.md` row + `defineComponent` entry for review | EC `+` | after D7 |

## Considered and left out (for now)
From CJS / SPICE, not in EC: battery (covered by `voltage-source`; internal resistance could be added later), DPDT and make-before-break switches, analog switches, transmission lines (SPICE `T`/`O`), photoresistor, thermistor, memristor, spark gap, fuse, crystal, gyrator, AM/FM/noise/audio sources, antenna, JFET (SPICE `J`), MESFET (`Z`), SCR, DIAC, TRIAC, Darlington, varactor, tunnel diode, triode, UJT, real op-amp, comparator, Schmitt trigger, OTA, CCII, optocoupler, LM317, TL431, buffers/tristate, multiplexers, shift registers, RAM/ROM, VCO, phase comparator, monostable, wattmeter, 3-phase motor, LED array, behavioural source (SPICE `B`), microcontrollers (D13). Add any of them with the checklist below.

## Reference screenshot readings (confirmed by owner, 2026-11-07)
- LED icon with bars beneath: RGB LED → `rgb-led`.
- Circle icons: AC voltage source (Hz) → `ac-source`; DC voltage source (V) → `voltage-source`; current source; voltmeter; ammeter; ohmmeter; Logic Source → `logic-input`; Logic Train → `clock`; lamp; DC motor.
- `=1` with a bubble: NOT gate.
- Yellow `+`: more parts / custom parts / request a new part with explanation and sources.

## How to add a component
1. Add a row to this file (pins, params with units, model, seen in, deliverable).
2. Add one `defineComponent(type, { idPrefix, pins, params })` entry in the matching category file in `packages/format/src/schema/components/` (`sources`, `passives`, `switches`, `semiconductors`). `idPrefix` gives automatic ids (R1, R2…). Describe each param with its unit (`positive("ohms")`, `.describe(...)`): the AI reads these. For a new category, add a file and spread it into `catalog.ts`.
3. Add format tests for valid and invalid params in `packages/format/test/`.
4. No format version bump for a **new** type: older apps report "Unknown component type ... update the app". Changing an **existing** part's pins or params needs a version bump plus a migration that fills defaults (ADR-008).
5. Add the part to `DC_MODELS` in `packages/engine/src/dc/branches.ts` (TypeScript fails until you do): a model, or `"not-simulated"` until its deliverable. The engine model ships with a golden test, then status becomes `simulated`.
6. Place its pins: add an entry to `PIN_OFFSETS` in `packages/format/src/layout/pins.ts` (TypeScript fails until you do; a test checks the names match the catalog). The app draws wires to these points and the MCP reports them to agents.
7. Draw it: add its symbol to `SYMBOLS` and its display name to `PART_NAMES` in `apps/web/src/app/circuit/symbols.ts` (the build fails until you do); the symbol's leads should end at the pin offsets. Give `defaults` in step 2 so it can be placed with one click.
