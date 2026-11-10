import type { Lesson } from "../schema"

export const LIGHT_AN_LED: Lesson = {
	id: "light-an-led",
	title: "Light an LED safely",
	level: "beginner",
	kind: "lesson",
	summary: "Ohm's law in practice: a resistor sets how much current an LED gets.",
	goal: "Light an LED from a 5 V source with a resistor in series, so it carries between 5 mA and 20 mA.",
	steps: [
		{ text: "Place a voltage source (5 V), a resistor, an LED and a ground." },
		{
			text: "Wire them in one loop: source + → resistor → LED anode (the triangle's flat side) → LED cathode → source −.",
			hint: "The LED only conducts one way: current goes in at the anode and out at the cathode (the bar).",
		},
		{
			text: "Choose the resistor. A red LED drops about 1.8 V, so the resistor has the rest: 5 V − 1.8 V = 3.2 V.",
			hint: "Ohm's law: R = V ÷ I. For 15 mA, R = 3.2 V ÷ 0.015 A ≈ 213 Ω; 220 Ω is a common value.",
		},
		{ text: "Click the LED and read its current. Too dim or too bright? Change the resistor and watch it change." },
	],
	checks: [
		{ kind: "has-part", type: "voltage-source", atLeast: 1, description: "There is a voltage source" },
		{ kind: "has-part", type: "resistor", atLeast: 1, description: "There is a resistor to limit the current" },
		{ kind: "has-part", type: "led", atLeast: 1, description: "There is an LED" },
		{ kind: "no-errors", description: "The circuit simulates without errors" },
		{ kind: "reading", type: "led", quantity: "current", between: [0.005, 0.02], description: "An LED carries 5–20 mA" },
	],
}
