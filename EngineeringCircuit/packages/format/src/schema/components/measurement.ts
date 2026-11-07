import { defineComponent } from "./define"

/** Ideal meters, as in CircuitJS1: they read the circuit without changing it (the ohmmeter's test current aside). */
export const MEASUREMENT = [
	defineComponent("voltmeter", { idPrefix: "VM", pins: ["positive", "negative"], params: {}, defaults: {} }),
	defineComponent("ammeter", { idPrefix: "AM", pins: ["positive", "negative"], params: {}, defaults: {} }),
	defineComponent("ohmmeter", { idPrefix: "OM", pins: ["a", "b"], params: {}, defaults: {} }),
] as const
