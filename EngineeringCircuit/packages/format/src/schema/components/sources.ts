import { z } from "zod"
import { defineComponent } from "./define"

export const SOURCES = [
	defineComponent("ground", { pins: ["terminal"], params: {} }),
	defineComponent("voltage-source", {
		pins: ["positive", "negative"],
		params: { voltage: z.number().describe("volts") },
	}),
	defineComponent("current-source", {
		pins: ["positive", "negative"],
		params: { current: z.number().describe("amps") },
	}),
] as const
