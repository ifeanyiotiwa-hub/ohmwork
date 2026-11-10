import { type Circuit, type Component, type Subcircuit, createCircuit } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { wireCurrents } from "../../src/dc/wire-currents"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { expectClose } from "../support/circuit-of"

const at = { position: { x: 0, y: 0 }, rotation: 0 } as const
const part = (id: string, type: Component["type"], params: Record<string, unknown>) => ({ id, type, ...at, params }) as Component
const wire = (id: string, from: string, to: string) => {
	const [fromId = "", fromPin = ""] = from.split(":")
	const [toId = "", toPin = ""] = to.split(":")
	return { id, from: { componentId: fromId, pin: fromPin }, to: { componentId: toId, pin: toPin }, bends: [] }
}

/** Two 1 kΩ resistors in series: top, mid, bottom. */
const divider: Subcircuit = {
	id: "divider",
	name: "Divider",
	pins: [
		{ name: "top", to: { componentId: "R1", pin: "a" } },
		{ name: "mid", to: { componentId: "R1", pin: "b" } },
		{ name: "bottom", to: { componentId: "R2", pin: "b" } },
	],
	components: [part("R1", "resistor", { resistance: 1000, powerRating: 0.25 }), part("R2", "resistor", { resistance: 1000, powerRating: 0.25 })],
	wires: [wire("w1", "R1:b", "R2:a")],
}

/** 1 kΩ and 1 µF: in, out (across the capacitor), ground. */
const rcChip: Subcircuit = {
	id: "rc",
	name: "RC",
	pins: [
		{ name: "in", to: { componentId: "R1", pin: "a" } },
		{ name: "out", to: { componentId: "C1", pin: "a" } },
		{ name: "gnd", to: { componentId: "C1", pin: "b" } },
	],
	components: [part("R1", "resistor", { resistance: 1000, powerRating: 0.25 }), part("C1", "capacitor", { capacitance: 1e-6 })],
	wires: [wire("w1", "R1:b", "C1:a")],
}

function driven(definitions: Subcircuit[], chip: Component, pins: { top: string; bottom: string }): Circuit {
	return {
		...createCircuit("Chips"),
		subcircuits: definitions,
		components: [part("V1", "voltage-source", { voltage: 5 }), chip, part("GND1", "ground", {})],
		wires: [wire("w1", "V1:positive", `${chip.id}:${pins.top}`), wire("w2", `${chip.id}:${pins.bottom}`, "GND1:terminal"), wire("w3", "V1:negative", "GND1:terminal")],
	}
}

test("a divider chip splits 5 V in half at its middle pin; its parts read under its name, and the current shows on the wire into it", () => {
	const circuit = driven([divider], part("X1", "subcircuit", { definition: "divider" }), { top: "top", bottom: "bottom" })
	const result = solveDc(circuit)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expectClose(result.solution.pinVoltages["X1:mid"], 2.5)
	expectClose(result.solution.readings["X1.R1"]?.current, 2.5e-3)
	expect(result.solution.warnings).toEqual([])
	expectClose(Math.abs(wireCurrents(circuit, result.solution).w1 ?? 0), 2.5e-3)
})

test("a capacitor inside a chip keeps its charge from step to step: 63% after one time constant", () => {
	const circuit = driven([rcChip], part("X1", "subcircuit", { definition: "rc" }), { top: "in", bottom: "gnd" })
	let state = initialTransientState()
	for (let step = 0; step < 200; step++) {
		const result = stepTransient(circuit, state, { timeStep: 5e-6 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
	}
	const last = stepTransient(circuit, state, { timeStep: 5e-6 })
	if (!last.ok) throw new Error(JSON.stringify(last.errors))
	// 201 steps of 5 µs ≈ 1.005 ms: 5 × (1 − e^−1.005) = 3.17 V.
	expect(last.solution.pinVoltages["X1:out"]).toBeCloseTo(5 * (1 - Math.exp(-1.005)), 2)
})

test("a chip inside a chip simulates too", () => {
	const pair: Subcircuit = {
		id: "pair",
		name: "Pair",
		pins: [
			{ name: "top", to: { componentId: "X1", pin: "top" } },
			{ name: "mid", to: { componentId: "X1", pin: "mid" } },
			{ name: "bottom", to: { componentId: "X1", pin: "bottom" } },
		],
		components: [part("X1", "subcircuit", { definition: "divider" })],
		wires: [],
	}
	const result = solveDc(driven([divider, pair], part("X2", "subcircuit", { definition: "pair" }), { top: "top", bottom: "bottom" }))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expectClose(result.solution.pinVoltages["X2:mid"], 2.5)
	expectClose(result.solution.readings["X2.X1.R2"]?.voltage, 2.5)
})
