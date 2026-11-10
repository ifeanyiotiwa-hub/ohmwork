import type { Lesson } from "../schema"

export const LOW_PASS_FILTER: Lesson = {
	id: "low-pass-filter",
	title: "Challenge: let 100 Hz through, stop 10 kHz",
	level: "advanced",
	kind: "challenge",
	summary: "Design a filter and prove it with the frequency response (the oscilloscope's Frequency view).",
	goal: "Build a low-pass filter fed by an AC source, with a scope probe on its output: at most 1 dB down at 100 Hz, 3 dB down (2–4 dB) at 1 kHz, and at least 15 dB down at 10 kHz.",
	steps: [],
	checks: [
		{ kind: "has-part", type: "ac-source", atLeast: 1, description: "There is an AC source" },
		{ kind: "has-part", type: "scope-probe", atLeast: 1, description: "There is a scope probe on the output" },
		{ kind: "ac-gain", at: 100, between: [-1, 0.5], description: "At 100 Hz the output is at most 1 dB down" },
		{ kind: "ac-gain", at: 1000, between: [-4, -2], description: "At 1 kHz the output is 3 dB down (the corner)" },
		{ kind: "ac-gain", at: 10000, between: [-200, -15], description: "At 10 kHz the output is at least 15 dB down" },
	],
}
