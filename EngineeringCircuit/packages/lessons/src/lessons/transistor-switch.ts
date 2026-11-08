import type { Lesson } from "../schema"

export const TRANSISTOR_SWITCH: Lesson = {
	id: "transistor-switch",
	title: "Switch an LED with a transistor",
	level: "intermediate",
	summary: "A small base current lets a much bigger collector current flow: the transistor as a switch.",
	goal: "Light an LED through an NPN transistor: pressing a push button feeds the base, and only then does the LED carry at least 2 mA.",
	steps: [
		{ text: "Build the LED loop from the first lesson, but send the LED's cathode into the NPN transistor's collector, and its emitter to ground." },
		{
			text: "Feed the base from the source through a push button and a resistor.",
			hint: "The base resistor keeps the base current small: about 10 kΩ gives (5 V − 0.7 V) ÷ 10 kΩ ≈ 0.43 mA.",
		},
		{
			text: "Hold the button: the LED lights. Release it: the LED goes out.",
			hint: "With β = 100, 0.43 mA of base current could let 43 mA flow, so the transistor is fully on (saturated).",
		},
	],
	checks: [
		{ kind: "has-part", type: "npn-transistor", atLeast: 1, description: "There is an NPN transistor" },
		{ kind: "has-part", type: "led", atLeast: 1, description: "There is an LED" },
		{ kind: "has-part", type: "push-button", atLeast: 1, description: "There is a push button" },
		{
			kind: "reading",
			type: "led",
			quantity: "current",
			between: [0.002, 0.03],
			pressed: true,
			description: "With the button held, an LED carries 2–30 mA",
		},
		{
			kind: "reading",
			type: "led",
			quantity: "current",
			between: [0, 0.0001],
			description: "With the button released, the LED is off (under 0.1 mA)",
		},
	],
}
