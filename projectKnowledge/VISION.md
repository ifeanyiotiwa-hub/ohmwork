# Vision

**EngineeringCircuit** is a free, open-source circuit simulator for studying, understanding, and creatively building circuits. It runs on web, Windows, macOS, Linux, and mobile, and has an MCP server so an AI agent can build circuits live, explain them, and tutor the learner.

Inspired by the *idea* of EveryCircuit. Clean-room: no decompiled code, assets, names, or look (see DECISIONS ADR-001).

## Who it's for
Learners from zero knowledge upward, and makers who want to experiment.

## Scope levels
| Level | Content | Status |
|---|---|---|
| 1 | Sources, resistors, switches, LEDs, capacitors, inductors | planned |
| 2 | Logic gates, flip-flops, counters, adders | planned |
| 3 | ICs: 555 timer, op-amps, 7-segment displays, transistors | planned |
| 4 (optional) | Microcontrollers (Arduino/AVR) running user code | later |

## What makes it different
- AI-native: the agent builds and explains real circuits through MCP, using real simulation data instead of guesses.
- Learning-first: lessons, challenges, and an AI tutor that checks your circuit.
- Works offline on any device.

## Non-goals (for now)
PCB layout, manufacturing export, commercial sales.

## The AI is a study partner, not a screenshot reader
Asking a general AI about a circuit today means screenshotting it and hoping the AI reads the picture right. Here the agent reads the real circuit through MCP: every part, connection, value, and live simulation reading, including the engine's plain-language warnings. So it can explain at a beginner's level ("the 2 Ω resistor gets 4 of the 6 volts because…"), spot mistakes, and change the circuit while the learner watches. The learner and the agent edit the same live circuit; either can change it, and every change is visible and undoable.

## References are a floor, not a ceiling
EveryCircuit screenshots and CircuitJS1 show what a good learning simulator offers today. They are the minimum to match, not a limit: we add parts, features, and teaching ideas they don't have. The "Seen in" column in `COMPONENTS.md` records where an idea was observed; it is never a filter on what we may build.
