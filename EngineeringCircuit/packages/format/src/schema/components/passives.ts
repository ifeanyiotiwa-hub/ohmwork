import { z } from "zod"
import { defineComponent, positive } from "./define"

export const PASSIVES = [
	defineComponent("resistor", {
		idPrefix: "R",
		pins: ["a", "b"],
		params: { resistance: positive("ohms") },
		defaults: { resistance: 1000 },
	}),
	defineComponent("capacitor", {
		idPrefix: "C",
		pins: ["a", "b"],
		params: { capacitance: positive("farads") },
		defaults: { capacitance: 1e-6 },
	}),
	defineComponent("inductor", {
		idPrefix: "L",
		pins: ["a", "b"],
		params: { inductance: positive("henries") },
		defaults: { inductance: 1e-3 },
	}),
	// Defaults below follow CircuitJS1 (PolarCapacitorElm, PotElm, TransformerElm) except the lamp; see COMPONENTS.md.
	defineComponent("polarized-capacitor", {
		idPrefix: "CP",
		pins: ["positive", "negative"],
		params: {
			capacitance: positive("farads"),
			maxReverseVoltage: z.number().nonnegative().describe("volts the negative pin may sit above the positive one"),
		},
		defaults: { capacitance: 1e-5, maxReverseVoltage: 1 },
	}),
	defineComponent("potentiometer", {
		idPrefix: "POT",
		pins: ["a", "b", "wiper"],
		params: {
			resistance: positive("ohms, end to end"),
			position: z.number().min(0).max(1).describe("wiper position from pin a (0) to pin b (1)"),
		},
		defaults: { resistance: 1000, position: 0.5 },
	}),
	defineComponent("lamp", {
		idPrefix: "LMP",
		pins: ["a", "b"],
		params: { ratedVoltage: positive("volts"), ratedPower: positive("watts at the rated voltage") },
		defaults: { ratedVoltage: 6, ratedPower: 1 },
	}),
	defineComponent("transformer", {
		idPrefix: "T",
		pins: ["primaryA", "primaryB", "secondaryA", "secondaryB"],
		params: {
			primaryInductance: positive("henries"),
			turnsRatio: positive("secondary turns per primary turn"),
			coupling: z.number().gt(0).lt(1).describe("coupling coefficient, between 0 and 1 (1 itself is not allowed)"),
		},
		defaults: { primaryInductance: 4, turnsRatio: 1, coupling: 0.999 },
	}),
] as const
