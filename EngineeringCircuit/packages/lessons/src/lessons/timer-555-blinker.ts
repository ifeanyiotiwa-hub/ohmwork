import type { Lesson } from "../schema"

export const TIMER_555_BLINKER: Lesson = {
	id: "timer-555-blinker",
	title: "Make a 555 blink an LED",
	level: "advanced",
	kind: "lesson",
	summary: "A 555 charges a capacitor through two resistors and empties it through one, over and over: an oscillator from a handful of parts.",
	goal: "Wire a 555 as an astable oscillator running at about 10 Hz (8–13 Hz), with an LED blinking on its output.",
	steps: [
		{ text: "Place a 9 V rail, a 555, two resistors, a capacitor, an LED with its resistor, and a ground." },
		{ text: "Feed the rail to the 555's VCC and reset; connect its ground pin to ground." },
		{
			text: "Run the rail through R1 to the discharge pin, then R2 from discharge to threshold. Join threshold to trigger, and the capacitor from there to ground.",
			hint: "The capacitor charges through R1 and R2 and empties through R2 alone: that is what makes it oscillate.",
		},
		{
			text: "Choose R1, R2 and C for about 10 Hz.",
			hint: "f ≈ 1.44 ÷ ((R1 + 2·R2) × C): 1 kΩ, 68 kΩ and 1 µF give about 10.5 Hz.",
		},
		{ text: "Drive the LED from the output through a resistor (470 Ω) to ground, and watch it blink." },
	],
	checks: [
		{ kind: "has-part", type: "timer-555", atLeast: 1, description: "There is a 555" },
		{ kind: "has-part", type: "led", atLeast: 1, description: "There is an LED" },
		{ kind: "frequency", type: "timer-555", pin: "output", after: 0.2, for: 0.5, between: [8, 13], description: "The 555's output goes up and down about 10 times a second" },
	],
}
