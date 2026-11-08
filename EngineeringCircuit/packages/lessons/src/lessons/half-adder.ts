import type { Lesson } from "../schema"

export const HALF_ADDER: Lesson = {
	id: "half-adder",
	title: "Build a half adder",
	level: "intermediate",
	summary: "Adding two bits needs two gates: XOR gives the sum, AND gives the carry.",
	goal: "With two logic inputs, light one logic output for the sum and another for the carry of A + B.",
	steps: [
		{ text: "Place two logic inputs (A and B), an XOR gate, an AND gate and two logic outputs." },
		{
			text: "Feed A and B into both gates. Connect XOR to one output (the sum) and AND to the other (the carry).",
			hint: "1 + 1 = 10 in binary: the sum digit is 0 and the carry is 1. Only XOR is 1 when exactly one input is 1.",
		},
		{ text: "Click the inputs to try all four combinations: 0+0, 0+1, 1+0, 1+1." },
	],
	checks: [
		{ kind: "has-part", type: "xor-gate", atLeast: 1, description: "There is an XOR gate" },
		{ kind: "has-part", type: "and-gate", atLeast: 1, description: "There is an AND gate" },
		{
			kind: "truth-table",
			rows: [
				{ inputs: [false, false], outputs: [false, false] },
				{ inputs: [false, true], outputs: [true, false] },
				{ inputs: [true, false], outputs: [true, false] },
				{ inputs: [true, true], outputs: [false, true] },
			],
			description: "The outputs give the sum and the carry of the two inputs, for all four combinations",
		},
	],
}
