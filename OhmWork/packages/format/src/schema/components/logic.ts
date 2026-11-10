import * as z from "zod"
import { defineComponent, positive } from "./define"

// Logic parts are referenced to ground (no supply pins, as in EveryCircuit and CircuitJS1). Outputs are 0 V or the
// circuit's logic-high voltage; inputs read 1 above half of it (CircuitJS1 GateElm / ChipElm).
const gate = <Type extends string>(type: Type, idPrefix: string) =>
	defineComponent(type, { idPrefix, pins: ["a", "b", "out"], params: {}, defaults: {} })
// Wider gates are their own types, since a part's pins never change with a setting (ADR-009). Only the widths sold
// as chips: 74HC11/74HC21 (AND 3/4), 74HC4075/74HC4072 (OR 3/4), 74HC10/74HC20 (NAND 3/4), 74HC27/74HC4002 (NOR 3/4).
const gate3 = <Type extends string>(type: Type, idPrefix: string) =>
	defineComponent(type, { idPrefix, pins: ["a", "b", "c", "out"], params: {}, defaults: {} })
const gate4 = <Type extends string>(type: Type, idPrefix: string) =>
	defineComponent(type, { idPrefix, pins: ["a", "b", "c", "d", "out"], params: {}, defaults: {} })

export const LOGIC = [
	defineComponent("logic-input", {
		idPrefix: "IN",
		pins: ["out"],
		params: { high: z.boolean().describe("true = outputs logic 1") },
		defaults: { high: false },
	}),
	defineComponent("logic-output", { idPrefix: "OUT", pins: ["in"], params: {}, defaults: {} }),
	defineComponent("clock", {
		idPrefix: "CLK",
		pins: ["out"],
		params: {
			frequency: positive("hertz"),
			dutyCycle: z.number().min(0).max(1).describe("fraction of each period spent at 1, 0 to 1"),
		},
		// CircuitJS1 ClockElm: 100 Hz.
		defaults: { frequency: 100, dutyCycle: 0.5 },
	}),
	defineComponent("not-gate", { idPrefix: "NOT", pins: ["in", "out"], params: {}, defaults: {} }),
	// A buffer whose output lets go of the line while enable is 0, so several can share a bus. Output values: TI
	// SN74HC125 (SCLS104F, April 2021) at 4.5 V, typical: 4.3 V at −6 mA (33 Ω) and 0.17 V at 6 mA (28 Ω), about
	// 30 Ω; continuous output current ±35 mA (absolute maximum). Its enable is active high (the 74HC125's is low).
	defineComponent("tri-state-buffer", {
		idPrefix: "TRI",
		pins: ["in", "enable", "out"],
		params: {
			outputResistance: positive("ohms the output drives through while enabled"),
			maxCurrent: positive("amps the output can carry continuously (absolute maximum)"),
		},
		defaults: { outputResistance: 30, maxCurrent: 0.035 },
	}),
	gate("and-gate", "AND"),
	gate("or-gate", "OR"),
	gate("nand-gate", "NAND"),
	gate("nor-gate", "NOR"),
	gate("xor-gate", "XOR"),
	gate("xnor-gate", "XNOR"),
	// Id prefixes are letters only (a digit would run into the number: AND31): T for three inputs, Q for quad.
	gate3("and-gate-3", "ANDT"),
	gate4("and-gate-4", "ANDQ"),
	gate3("or-gate-3", "ORT"),
	gate4("or-gate-4", "ORQ"),
	gate3("nand-gate-3", "NANDT"),
	gate4("nand-gate-4", "NANDQ"),
	gate3("nor-gate-3", "NORT"),
	gate4("nor-gate-4", "NORQ"),
	defineComponent("sr-latch", { idPrefix: "SR", pins: ["s", "r", "q", "qNot"], params: {}, defaults: {} }),
	defineComponent("sr-latch-inverted", { idPrefix: "SRN", pins: ["sNot", "rNot", "q", "qNot"], params: {}, defaults: {} }),
	defineComponent("d-flip-flop", { idPrefix: "DFF", pins: ["d", "clk", "q", "qNot"], params: {}, defaults: {} }),
	defineComponent("t-flip-flop", { idPrefix: "TFF", pins: ["t", "clk", "q", "qNot"], params: {}, defaults: {} }),
	defineComponent("jk-flip-flop", { idPrefix: "JKFF", pins: ["j", "clk", "k", "q", "qNot"], params: {}, defaults: {} }),
	defineComponent("counter-4bit", {
		idPrefix: "CNT",
		pins: ["clk", "reset", "q0", "q1", "q2", "q3"],
		params: {},
		defaults: {},
	}),
] as const
