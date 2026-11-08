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
| Truth table | A list of a logic circuit's outputs for every combination of its inputs. |
| Logic level | The voltage that counts as 1 (logic high, 5 V by default); anything above half of it reads as 1. |
| Zener diode | A diode made to conduct backwards at a set voltage; used to hold a voltage steady. |
| Relay | A switch moved by an electromagnet: current in its coil pulls the contact over. |
| ADC / DAC | Analog-to-digital converter (a voltage in, a number out) and digital-to-analog converter (the reverse). |
| Transformer | Two coils sharing a magnetic core: AC in one makes AC in the other, scaled by the turns ratio. |
| Potentiometer | A resistor with a sliding middle contact; a knob that splits a voltage. |
| Controlled source | A source whose output is set by a voltage or current elsewhere in the circuit (SPICE E, F, G, H). |
| Rating / burn-out | The most a real part can take (current, power, voltage); beyond it a real one would be damaged, and the simulator warns. |
| Junction (dot) | A point where wires join in the middle of a wire. |
| Lesson check | A test of what the learner's circuit does (a reading, a voltage, a truth table), not how it is drawn. |
| Live link | The connection that lets the learner and the AI agent edit the same circuit at once. |

