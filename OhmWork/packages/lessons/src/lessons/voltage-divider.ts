import type { Lesson } from "../schema"

export const VOLTAGE_DIVIDER: Lesson = {
	id: "voltage-divider",
	title: "Make 2.5 V from 5 V",
	level: "beginner",
	kind: "lesson",
	summary: "Two resistors in series share a voltage in proportion to their resistances.",
	goal: "With a 5 V source and two resistors, make a point in the circuit that sits at 2.5 V (2.4–2.6 V).",
	steps: [
		{ text: "Place a 5 V voltage source, two resistors and a ground." },
		{ text: "Wire the source across the two resistors in series, and ground the source's − side." },
		{
			text: "Look at the voltage where the two resistors meet. Change the resistors until it reads 2.5 V.",
			hint: "The bottom resistor gets 5 V × R2 ÷ (R1 + R2). Equal resistors split it in half.",
		},
	],
	checks: [
		{ kind: "reading", type: "voltage-source", quantity: "voltage", between: [4.9, 5.1], description: "The source is 5 V" },
		{ kind: "has-part", type: "resistor", atLeast: 2, description: "There are two resistors" },
		{ kind: "no-errors", description: "The circuit simulates without errors" },
		{ kind: "node-voltage", between: [2.4, 2.6], description: "Some point sits at 2.4–2.6 V" },
	],
}
