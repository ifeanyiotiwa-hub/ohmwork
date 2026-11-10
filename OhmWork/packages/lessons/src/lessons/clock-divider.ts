import type { Lesson } from "../schema"

export const CLOCK_DIVIDER: Lesson = {
	id: "clock-divider",
	title: "Halve a clock with a flip-flop",
	level: "intermediate",
	kind: "lesson",
	summary: "A flip-flop that toggles on every rising clock edge changes half as often as its clock: the first step of every counter.",
	goal: "Take a 10 Hz clock and light a logic output at 5 Hz (4.75–5.25 Hz), half the clock's rate.",
	steps: [
		{ text: "Place a clock (set it to 10 Hz), a T flip-flop, a logic input and a logic output." },
		{ text: "Set the logic input to 1 and wire it to the flip-flop's T, so it toggles on every clock edge." },
		{ text: "Wire the clock to the flip-flop's clock input, and its Q to the logic output." },
		{
			text: "Run it and compare the clock with the output.",
			hint: "Slow it down to see it: with nothing selected, set the speed lower. A D flip-flop with Q̄ wired back to D toggles the same way.",
		},
	],
	checks: [
		{ kind: "frequency", type: "clock", pin: "out", after: 0.05, for: 0.6, between: [9.5, 10.5], description: "The clock runs at 10 Hz" },
		{ kind: "frequency", type: "logic-output", pin: "in", after: 0.05, for: 0.6, between: [4.75, 5.25], description: "A logic output blinks at 5 Hz, half the clock" },
	],
}
