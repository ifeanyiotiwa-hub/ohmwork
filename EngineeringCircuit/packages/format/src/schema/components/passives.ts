import { defineComponent, positive } from "./define"

export const PASSIVES = [
	defineComponent("resistor", { pins: ["a", "b"], params: { resistance: positive("ohms") } }),
	defineComponent("capacitor", { pins: ["a", "b"], params: { capacitance: positive("farads") } }),
	defineComponent("inductor", { pins: ["a", "b"], params: { inductance: positive("henries") } }),
] as const
