import type { Circuit } from "../../src/schema/circuit"

export const voltageDivider = (): Circuit => ({
	format: "engineering-circuit",
	version: 6,
	name: "Voltage divider",
	description: "10 V split by two equal resistors",
	simulation: { timeStep: 5e-6, speed: 0.01, logicHigh: 5 },
	notes: [],
	components: [
		{ id: "V1", type: "voltage-source", position: { x: 0, y: 0 }, rotation: 0, params: { voltage: 10 } },
		{ id: "R1", type: "resistor", position: { x: 100, y: 0 }, rotation: 90, params: { resistance: 1000, powerRating: 0.25 } },
		{ id: "R2", type: "resistor", position: { x: 100, y: 100 }, rotation: 90, params: { resistance: 1000, powerRating: 0.25 } },
		{ id: "GND", type: "ground", position: { x: 0, y: 200 }, rotation: 0, params: {} },
	],
	wires: [
		{ id: "w1", from: { componentId: "V1", pin: "positive" }, to: { componentId: "R1", pin: "a" }, bends: [] },
		{ id: "w2", from: { componentId: "R1", pin: "b" }, to: { componentId: "R2", pin: "a" }, bends: [] },
		{ id: "w3", from: { componentId: "R2", pin: "b" }, to: { componentId: "V1", pin: "negative" }, bends: [] },
		{ id: "w4", from: { componentId: "V1", pin: "negative" }, to: { componentId: "GND", pin: "terminal" }, bends: [] },
	],
})
