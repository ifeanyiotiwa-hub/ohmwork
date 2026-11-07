import { z } from "zod"
import { defineComponent } from "./define"

export const SOURCES = [
	defineComponent("ground", { idPrefix: "GND", pins: ["terminal"], params: {} }),
	defineComponent("voltage-source", {
		idPrefix: "V",
		pins: ["positive", "negative"],
		params: { voltage: z.number().describe("volts") },
	}),
	defineComponent("current-source", {
		idPrefix: "I",
		pins: ["positive", "negative"],
		params: { current: z.number().describe("amps, flowing out of the positive pin") },
	}),
] as const
