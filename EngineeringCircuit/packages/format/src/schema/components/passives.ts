import { defineComponent, positive } from "./define"

export const PASSIVES = [
	defineComponent("resistor", { idPrefix: "R", pins: ["a", "b"], params: { resistance: positive("ohms") } }),
	defineComponent("capacitor", { idPrefix: "C", pins: ["a", "b"], params: { capacitance: positive("farads") } }),
	defineComponent("inductor", { idPrefix: "L", pins: ["a", "b"], params: { inductance: positive("henries") } }),
] as const
