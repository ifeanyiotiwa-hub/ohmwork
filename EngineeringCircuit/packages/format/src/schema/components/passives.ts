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
] as const
