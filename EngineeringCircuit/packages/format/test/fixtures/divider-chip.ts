import { type Circuit, type Subcircuit, createCircuit } from "../../src/schema/circuit"

const at = (x: number, y: number) => ({ position: { x, y }, rotation: 0 as const })

/** Two 1 kΩ resistors in series as a chip: top, mid and bottom. */
export const dividerChip = (): Subcircuit => ({
	id: "divider",
	name: "Divider",
	pins: [
		{ name: "top", to: { componentId: "R1", pin: "a" } },
		{ name: "mid", to: { componentId: "R1", pin: "b" } },
		{ name: "bottom", to: { componentId: "R2", pin: "b" } },
	],
	components: [
		{ id: "R1", type: "resistor", ...at(0, 0), params: { resistance: 1000, powerRating: 0.25 } },
		{ id: "R2", type: "resistor", ...at(0, 80), params: { resistance: 1000, powerRating: 0.25 } },
	],
	wires: [{ id: "w1", from: { componentId: "R1", pin: "b" }, to: { componentId: "R2", pin: "a" }, bends: [] }],
})

/** 5 V across one divider chip, X1. */
export function circuitWithChip(): Circuit {
	return {
		...createCircuit("Chip"),
		subcircuits: [dividerChip()],
		components: [
			{ id: "V1", type: "voltage-source", ...at(0, 0), params: { voltage: 5 } },
			{ id: "X1", type: "subcircuit", ...at(200, 0), params: { definition: "divider" } },
			{ id: "GND1", type: "ground", ...at(100, 200), params: {} },
		],
		wires: [
			{ id: "w1", from: { componentId: "V1", pin: "positive" }, to: { componentId: "X1", pin: "top" }, bends: [] },
			{ id: "w2", from: { componentId: "X1", pin: "bottom" }, to: { componentId: "GND1", pin: "terminal" }, bends: [] },
			{ id: "w3", from: { componentId: "V1", pin: "negative" }, to: { componentId: "GND1", pin: "terminal" }, bends: [] },
		],
	}
}
