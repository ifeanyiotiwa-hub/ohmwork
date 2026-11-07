import { z } from "zod"
import { defineComponent, positive } from "./define"

export const SOURCES = [
	defineComponent("ground", { idPrefix: "GND", pins: ["terminal"], params: {}, defaults: {} }),
	defineComponent("voltage-source", {
		idPrefix: "V",
		pins: ["positive", "negative"],
		params: { voltage: z.number().describe("volts") },
		defaults: { voltage: 5 },
	}),
	defineComponent("current-source", {
		idPrefix: "I",
		pins: ["positive", "negative"],
		params: { current: z.number().describe("amps, flowing out of the positive pin") },
		defaults: { current: 0.001 },
	}),
	// Waveforms follow SPICE SIN and PULSE (ngspice manual §4.1); defaults are CircuitJS1's (5 V, 40 Hz).
	defineComponent("ac-source", {
		idPrefix: "AC",
		pins: ["positive", "negative"],
		params: {
			amplitude: z.number().describe("volts (peak)"),
			frequency: positive("hertz"),
			offset: z.number().describe("volts"),
			phase: z.number().describe("degrees"),
			delay: z.number().nonnegative().describe("seconds"),
		},
		defaults: { amplitude: 5, frequency: 40, offset: 0, phase: 0, delay: 0 },
	}),
	defineComponent("square-source", {
		idPrefix: "SQ",
		pins: ["positive", "negative"],
		params: {
			low: z.number().describe("volts"),
			high: z.number().describe("volts"),
			frequency: positive("hertz"),
			dutyCycle: z.number().min(0).max(1).describe("fraction of each period spent high, 0 to 1"),
		},
		defaults: { low: 0, high: 5, frequency: 40, dutyCycle: 0.5 },
	}),
] as const
