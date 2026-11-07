import { z } from "zod"
import { defineComponent, positive } from "./define"

// Logic parts are referenced to ground (no supply pins, as in EveryCircuit and CircuitJS1). Outputs are 0 V or the
// circuit's logic-high voltage; inputs read 1 above half of it (CircuitJS1 GateElm / ChipElm).
const gate = <Type extends string>(type: Type, idPrefix: string) =>
	defineComponent(type, { idPrefix, pins: ["a", "b", "out"], params: {}, defaults: {} })

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
	gate("and-gate", "AND"),
	gate("or-gate", "OR"),
	gate("nand-gate", "NAND"),
	gate("nor-gate", "NOR"),
	gate("xor-gate", "XOR"),
	gate("xnor-gate", "XNOR"),
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
