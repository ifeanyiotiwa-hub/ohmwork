# Component inventory

Every part the app will support up to scope level 3, plus what was considered and left out.
Status: `in format` (defined in `packages/format`) · `simulated` (engine model + golden test) · `planned`.
Units are SI. Pin names are lowercase words. Parameter names are ours; defaults are confirmed by the owning deliverable's golden test.

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
| `vcvs` | controlPositive, controlNegative, positive, negative | gain (V/V) | voltage-controlled voltage source | EC, CJS, SPICE `E` | D3 | planned |
| `vccs` | controlPositive, controlNegative, positive, negative | transconductance (A/V) | voltage-controlled current source | EC, CJS, SPICE `G` | D3 | planned |
| `ccvs` | senseIn, senseOut, positive, negative | transresistance (Ω) | current through sense pins (0 V path) controls voltage | EC, CJS, SPICE `H` | D3 | planned |
| `cccs` | senseIn, senseOut, positive, negative | gain (A/A) | current through sense pins controls current | EC, CJS, SPICE `F` | D3 | planned |
| `voltage-rail` | terminal | voltage (V) | source to ground drawn as one pin (e.g. +5 V) | CJS | D5 | planned |
| `ac-source` | positive, negative | amplitude (V), frequency (Hz), offset (V), phase (deg), delay (s) | sine, SPICE `SIN(VO VA FREQ TD THETA PHASE)` without damping | EC, CJS, SPICE | D3 | planned |
| `square-source` | positive, negative | low (V), high (V), frequency (Hz), dutyCycle (0–1) | pulse, SPICE `PULSE` with fixed fast edges | CJS, SPICE | D3 | planned |
| `clock` | out | frequency (Hz), dutyCycle | logic square wave | EC, CJS | D5 | planned |

## Passive
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `resistor` | a, b | resistance (Ω) | Ohm's law | EC, CJS, SPICE `R` | D2 | in format |
| `capacitor` | a, b | capacitance (F) | companion model (trapezoidal) | EC, CJS, SPICE `C` | D3 | in format |
| `polarized-capacitor` | positive, negative | capacitance (F) | capacitor; warns when reverse-biased | EC, CJS | D3 | planned |
| `inductor` | a, b | inductance (H) | companion model (trapezoidal) | EC, CJS, SPICE `L` | D3 | in format |
| `potentiometer` | a, b, wiper | resistance (Ω), position (0–1) | two resistors split at the wiper | EC, CJS | D3 | planned |
| `transformer` | primaryA, primaryB, secondaryA, secondaryB | primaryInductance (H), turnsRatio, coupling (0–1] | coupled inductors, SPICE `K` | EC, CJS, SPICE `K` | D3 | planned |
| `tapped-transformer` | primaryA, primaryB, secondaryA, secondaryTap, secondaryB | as transformer | coupled inductors, centre tap | EC, CJS | later | planned |
| `lamp` | a, b | ratedVoltage (V), ratedPower (W) | resistor R = V²/P; brightness from power | EC, CJS | D3 | planned |
| `dc-motor` | a, b | resistance (Ω), inductance (H), back-EMF constant | electrical + simple rotation model | EC, CJS | later | planned |

## Switches
| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `switch` (SPST) | a, b | closed | tiny / huge resistance | EC, CJS | D2 | in format |
| `switch-spdt` | common, a, b | position (a/b) | two switches | EC, CJS | D3 | planned |
| `push-button` | a, b | normallyOpen (true = NO, false = NC) | switch, toggles while pressed | EC (NO and NC), CJS | D6 | planned |
| `relay` | coilA, coilB, common, normallyOpen, normallyClosed | coilVoltage (V), coilResistance (Ω) | coil current drives switch | EC, CJS | D9 | planned |

## Semiconductors
Diode-family params follow SPICE §7.2: saturationCurrent (IS, default 1e-14 A), emissionCoefficient (N, default 1), seriesResistance (RS, default 0 Ω), breakdownVoltage (BV, default none). The UI may also offer "forward voltage at a current" and convert, as CJS does.

| Type | Pins | Params | Model | Seen in | Deliverable | Status |
|---|---|---|---|---|---|---|
| `diode` | anode, cathode | diode-family params | Shockley equation, Newton–Raphson. CJS default: IS 1.714e-7, N 2 (≈0.81 V at 1 A) | EC, CJS, SPICE `D` | D4 | in format (no electrical params yet) |
| `zener-diode` | anode, cathode | diode-family + breakdownVoltage (CJS default 5.6 V) | diode with reverse breakdown | EC, CJS, SPICE `D` (BV) | D4 | planned |
| `led` | anode, cathode | color, diode-family params, maxBrightnessCurrent (CJS 10 mA) | diode + brightness. CJS default: IS 93.2e-12, RS 0.042, N 3.73 (≈2.23 V at 1 A), red | EC, CJS | D4 | in format (no electrical params yet) |
| `npn-transistor` | collector, base, emitter | beta (SPICE BF default 100), betaReverse (BR 1), saturationCurrent (IS: SPICE 1e-16, CJS 1e-13) | Ebers–Moll (SPICE level 1 reduces to it) | EC, CJS, SPICE `Q` | D4 | planned |
| `pnp-transistor` | collector, base, emitter | as NPN | Ebers–Moll | EC, CJS, SPICE `Q` | D4 | planned |
| `n-mosfet` | drain, gate, source | thresholdVoltage (V), transconductance (A/V²) | square-law (SPICE level 1). Defaults not yet checked | EC, CJS, SPICE `M` | D4 | planned |
| `p-mosfet` | drain, gate, source | as N-MOSFET | square-law | EC, CJS, SPICE `M` | D4 | planned |

## Digital logic
Gates have fixed inputs: 2 for most, 1 for NOT. Wider gates are built by chaining. Logic level comes from the logic-family setting (see "Not a component").

| Type | Pins | Params | Seen in | Deliverable | Status |
|---|---|---|---|---|---|
| `logic-input` (toggle) | out | high | EC?, CJS | D5 | planned |
| `logic-output` (indicator) | in | – | CJS | D5 | planned |
| `not-gate` | in, out | – | EC?, CJS (Inverter) | D5 | planned |
| `and-gate`, `or-gate`, `nand-gate`, `nor-gate`, `xor-gate`, `xnor-gate` | a, b, out | – | EC, CJS | D5 | planned |
| `sr-latch` (NOR, active-high) | s, r, q, qNot | – | EC | D5 | planned |
| `sr-latch-inverted` (NAND, active-low S̄R̄) | sNot, rNot, q, qNot | – | EC | D5 | planned |
| `d-flip-flop` | d, clk, q, qNot | – | EC, CJS | D5 | planned |
| `t-flip-flop` | t, clk, q, qNot | – | EC, CJS | D5 | planned |
| `jk-flip-flop` | j, k, clk, q, qNot | – | EC, CJS | D5 | planned |
| `counter-4bit` | clk, reset, q0, q1, q2, q3 | – | EC, CJS | D5 | planned |

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
| `voltmeter` | positive, negative | – | open circuit, reads voltage | EC, CJS | D6 | planned |
| `ammeter` | positive, negative | – | 0 V source, reads current | EC, CJS | D6 | planned |
| `ohmmeter` | a, b | – | injects a small test current, reads V/I | EC, CJS | D6 | planned |
| `scope-probe` | positive, negative | channel, label | records voltage over time | CJS (Voltmeter/Scope Probe) | D9 | planned |

## Not a component, but needed
| Item | Why | Seen in | Deliverable |
|---|---|---|---|
| Junction | Wires connect pin to pin only today; joining mid-wire needs a junction | CJS (wires join anywhere) | D6 |
| Labeled node (net label, e.g. "VCC") | Connect distant points by name | CJS | later |
| Text notes | Lessons and AI explanations (separate `annotations` list) | CJS | D12 |
| Simulation settings | Time step, duration, logic family; saved with the circuit | SPICE (TSTEP/TSTOP) | D3 / D5 |
| Subcircuits ("custom chips") | Learner builds a half adder, saves it as a reusable part | CJS, SPICE `X`, EC `+`? | later |

## Considered and left out (for now)
From CJS / SPICE, not in EC: battery (covered by `voltage-source`; internal resistance could be added later), DPDT and make-before-break switches, analog switches, transmission lines (SPICE `T`/`O`), photoresistor, thermistor, memristor, spark gap, fuse, crystal, gyrator, AM/FM/noise/audio sources, antenna, JFET (SPICE `J`), MESFET (`Z`), SCR, DIAC, TRIAC, Darlington, varactor, tunnel diode, triode, UJT, real op-amp, comparator, Schmitt trigger, OTA, CCII, optocoupler, LM317, TL431, buffers/tristate, multiplexers, shift registers, RAM/ROM, VCO, phase comparator, monostable, wattmeter, 3-phase motor, LED array, behavioural source (SPICE `B`), microcontrollers (D13). Add any of them with the checklist below.

## Unclear readings of the reference screenshots
- Second LED-like icon (LED symbol with bars beneath): not identified. Possibly a photodiode or LED variant.
- Circle with a vertical bar: read as `logic-input`.
- Third gate icon (`=1` with bubble, before NAND): read as `not-gate`.
- `+` at the end of the toolbar: read as "more parts / custom". Not confirmed.

## How to add a component
1. Add a row to this file (pins, params with units, model, seen in, deliverable).
2. Add one `defineComponent(...)` entry in the matching category file in `packages/format/src/schema/components/` (`sources`, `passives`, `switches`, `semiconductors`). For a new category, add a file and spread it into `catalog.ts`.
3. Add format tests for valid and invalid params in `packages/format/test/`.
4. No format version bump for a **new** type: older apps report "Unknown component type ... update the app". Changing an **existing** part's pins or params needs a version bump plus a migration that fills defaults (ADR-008).
5. The engine model ships in its deliverable with a golden test, then status becomes `simulated`.
