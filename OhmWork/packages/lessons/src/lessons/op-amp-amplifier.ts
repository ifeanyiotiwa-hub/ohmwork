import type { Lesson } from "../schema"

export const OP_AMP_AMPLIFIER: Lesson = {
	id: "op-amp-amplifier",
	title: "Amplify a signal ten times",
	level: "intermediate",
	kind: "lesson",
	summary: "An op-amp with two resistors of feedback amplifies by a gain the resistors set, whatever the op-amp itself does.",
	goal: "Make 0.2 V into 2 V (1.95–2.05 V) at an op-amp's output, with a non-inverting amplifier.",
	steps: [
		{ text: "Place a 0.2 V voltage source, an op-amp, two resistors and a ground." },
		{ text: "Feed the source into the op-amp's + input." },
		{
			text: "From the output, run one resistor (the feedback) to the − input, and the other from the − input to ground.",
			hint: "The op-amp drives its output until its two inputs are equal, so the − input sits at 0.2 V too.",
		},
		{
			text: "Choose the resistors for a gain of 10.",
			hint: "A non-inverting amplifier's gain is 1 + feedback ÷ ground resistor: 9 kΩ and 1 kΩ give 10.",
		},
	],
	checks: [
		{ kind: "has-part", type: "op-amp", atLeast: 1, description: "There is an op-amp" },
		{ kind: "reading", type: "voltage-source", quantity: "voltage", between: [0.19, 0.21], description: "The source is 0.2 V" },
		{ kind: "pin-voltage", type: "op-amp", pin: "output", between: [1.95, 2.05], description: "An op-amp's output is at 2 V (ten times 0.2 V)" },
	],
}
