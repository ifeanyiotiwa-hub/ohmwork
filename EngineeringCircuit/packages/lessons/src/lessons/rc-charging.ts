import type { Lesson } from "../schema"

export const RC_CHARGING: Lesson = {
	id: "rc-charging",
	title: "Charge a capacitor in one millisecond",
	level: "beginner",
	kind: "lesson",
	summary: "A capacitor charges through a resistor; R × C (the time constant) sets how fast.",
	goal: "Charge a capacitor from 5 V through a resistor so that after 1 ms it holds about 63% of the supply (2.9–3.4 V).",
	steps: [
		{ text: "Place a 5 V voltage source, a resistor, a capacitor and a ground, all in one loop." },
		{
			text: "Watch the capacitor's voltage rise and level off. Press Restart to see it again from empty.",
			hint: "Slow it down: with nothing selected, set the speed lower, e.g. 0.0002.",
		},
		{
			text: "Choose R and C so the time constant R × C is 1 ms.",
			hint: "After one time constant a capacitor reaches 1 − 1/e ≈ 63% of the supply. 1 kΩ × 1 µF = 1 ms.",
		},
	],
	checks: [
		{ kind: "has-part", type: "capacitor", atLeast: 1, description: "There is a capacitor" },
		{ kind: "has-part", type: "resistor", atLeast: 1, description: "There is a resistor" },
		{ kind: "reading", type: "voltage-source", quantity: "voltage", between: [4.9, 5.1], description: "The source is 5 V" },
		{
			kind: "reading-at",
			type: "capacitor",
			quantity: "voltage",
			at: 0.001,
			between: [2.9, 3.4],
			description: "After 1 ms a capacitor holds 2.9–3.4 V (about 63% of 5 V)",
		},
	],
}
