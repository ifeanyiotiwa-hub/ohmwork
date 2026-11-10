import { defineComponent } from "./define"

/** Ideal meters, as in CircuitJS1: they read the circuit without changing it (the ohmmeter's test current aside). */
export const MEASUREMENT = [
	defineComponent("voltmeter", { idPrefix: "VM", pins: ["positive", "negative"], params: {}, defaults: {} }),
	defineComponent("ammeter", { idPrefix: "AM", pins: ["positive", "negative"], params: {}, defaults: {} }),
	defineComponent("ohmmeter", { idPrefix: "OM", pins: ["a", "b"], params: {}, defaults: {} }),
	// Records the voltage between its pins over time for the oscilloscope view (CircuitJS1 scope probe).
	defineComponent("scope-probe", { idPrefix: "P", pins: ["positive", "negative"], params: {}, defaults: {} }),
] as const
