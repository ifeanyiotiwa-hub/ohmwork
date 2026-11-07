import { z } from "zod"
import { defineComponent, positive } from "./define"

export const ICS = [
	// CircuitJS1 OpAmpElm: gain 100000, output limited to ±15 V. Supply is implied (no supply pins).
	defineComponent("op-amp", {
		idPrefix: "U",
		pins: ["nonInverting", "inverting", "output"],
		params: {
			gain: positive("ratio, open-loop gain"),
			supplyHigh: z.number().describe("volts, the highest the output can go"),
			supplyLow: z.number().describe("volts, the lowest the output can go"),
		},
		defaults: { gain: 100000, supplyHigh: 15, supplyLow: -15 },
	}),
	// CircuitJS1 TimerElm (a 555): internal 5 kΩ / 10 kΩ divider puts control at ⅔ of vcc.
	defineComponent("timer-555", {
		idPrefix: "IC",
		pins: ["ground", "trigger", "output", "reset", "control", "threshold", "discharge", "vcc"],
		params: {},
		defaults: {},
	}),
] as const
