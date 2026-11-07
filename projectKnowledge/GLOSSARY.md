# Glossary (plain language)

| Term | Meaning |
|---|---|
| Voltage (V) | Electrical "pressure" between two points. Pushes current. |
| Current (A) | Flow of charge through a wire. |
| Resistance (Ω) | How much a part resists current. Ohm's law: V = I × R. |
| Ground | The 0 V reference point every voltage is measured from. |
| Node | A point where parts connect; everything on one node has the same voltage. |
| Capacitor | Stores charge; smooths and delays signals. |
| Inductor | Stores energy in a magnetic field; resists changes in current. |
| Diode / LED | Lets current flow one way only; an LED also lights up. |
| Transistor (BJT/MOSFET) | An electronic switch/amplifier controlled by a small signal. |
| Logic gate | Digital building block (AND, OR, NOT…) working on 0/1. |
| Flip-flop | A 1-bit memory made of gates. |
| IC | Integrated circuit: many parts packaged as one chip (e.g. 555 timer, op-amp). |
| Op-amp | IC that amplifies the difference between two inputs. |
| MCU | Microcontroller: a tiny programmable computer (e.g. Arduino). |
| DC analysis | Steady-state values when nothing changes over time. |
| Transient analysis | How values change over time, step by step. |
| MNA | Modified Nodal Analysis: the standard method simulators use to turn a circuit into equations. |
| Netlist | A circuit described as data: parts plus what connects to what. |
| Oscilloscope | Graph of a voltage over time. |
| MCP | Model Context Protocol: lets AI agents use the app's tools. |
| Net | Same as a node: all pins joined by wires. |
| Short circuit | Two points joined with (almost) no resistance, e.g. a wire straight across a battery. Real batteries overheat; the simulator reports it. |
| Floating | A part of the circuit with no connection to ground, so its voltages have no fixed reference. |
| Passive sign convention | How we sign current: positive when it flows into a part's first pin. A battery delivering power shows negative current. |
