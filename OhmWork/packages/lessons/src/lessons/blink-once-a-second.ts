import type { Lesson } from "../schema"

export const BLINK_ONCE_A_SECOND: Lesson = {
	id: "blink-once-a-second",
	title: "Challenge: blink once a second",
	level: "advanced",
	kind: "challenge",
	summary: "Design the timing yourself: a 555 blinking an LED at 1 Hz.",
	goal: "Make an LED blink once a second (0.9–1.1 Hz) with a 555.",
	steps: [],
	checks: [
		{ kind: "has-part", type: "led", atLeast: 1, description: "There is an LED" },
		{ kind: "frequency", type: "timer-555", pin: "output", after: 1.5, for: 3, between: [0.9, 1.1], description: "A 555's output goes up and down once a second" },
	],
}
