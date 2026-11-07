import { type Circuit, createCircuit } from "@engineering-circuit/format"

export const kvlExample = (): Circuit => ({
	...createCircuit("KVL and voltage divider"),
	name: "KVL and voltage divider",
	description: "6 V shared by 1 Ω and 2 Ω: the 2 Ω resistor gets two thirds of the voltage.",
	components: [
		{ id: "V1", type: "voltage-source", position: { x: 0, y: 100 }, rotation: 90, params: { voltage: 6 } },
		{ id: "R1", type: "resistor", position: { x: 160, y: 0 }, rotation: 0, params: { resistance: 1 } },
		{ id: "R2", type: "resistor", position: { x: 320, y: 100 }, rotation: 90, params: { resistance: 2 } },
		{ id: "GND1", type: "ground", position: { x: 160, y: 240 }, rotation: 0, params: {} },
	],
	wires: [
		{ id: "w1", from: { componentId: "V1", pin: "positive" }, to: { componentId: "R1", pin: "a" }, bends: [{ x: 0, y: 0 }] },
		{ id: "w2", from: { componentId: "R1", pin: "b" }, to: { componentId: "R2", pin: "a" }, bends: [{ x: 320, y: 0 }] },
		{ id: "w3", from: { componentId: "R2", pin: "b" }, to: { componentId: "GND1", pin: "terminal" }, bends: [{ x: 320, y: 220 }] },
		{ id: "w4", from: { componentId: "V1", pin: "negative" }, to: { componentId: "GND1", pin: "terminal" }, bends: [{ x: 0, y: 220 }] },
	],
})
