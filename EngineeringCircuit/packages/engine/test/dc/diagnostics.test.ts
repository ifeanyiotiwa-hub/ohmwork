import { createCircuit } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { circuitOf, expectClose } from "../support/circuit-of"

const errorsOf = (circuit: ReturnType<typeof circuitOf>) => {
	const result = solveDc(circuit)
	if (result.ok) throw new Error("expected the circuit to be rejected")
	return result.errors
}

test("an empty circuit solves to nothing", () => {
	expect(solveDc(createCircuit("Empty"))).toEqual({
		ok: true,
		solution: { pinVoltages: {}, readings: {}, ports: {}, warnings: [] },
	})
})

test("a wire across a battery is reported as a short circuit", () => {
	const circuit = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 9 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["V1.positive", "V1.negative"],
			["V1.negative", "GND.terminal"],
		],
	)

	expect(errorsOf(circuit)).toEqual([
		{
			componentIds: ["V1"],
			message:
				'Short circuit: "V1" is connected in a loop of voltage sources, closed switches, inductors, ammeters and wires with no resistance.',
		},
	])
})

test("a closed switch across a battery is a short circuit", () => {
	const circuit = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 9 } },
			{ id: "S1", type: "switch", params: { closed: true } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["V1.positive", "S1.a"],
			["S1.b", "V1.negative"],
			["V1.negative", "GND.terminal"],
		],
	)

	expect(errorsOf(circuit).map((error) => error.componentIds)).toEqual([["S1"]])
})

test("a current source with nowhere for its current to go is rejected", () => {
	const circuit = circuitOf(
		[
			{ id: "I1", type: "current-source", params: { current: 0.001 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["I1.positive", "R1.a"],
			["I1.negative", "GND.terminal"],
		],
	)

	expect(errorsOf(circuit)).toEqual([
		{
			componentIds: ["I1"],
			message: 'No path for current: "I1" pushes current into a part of the circuit with no way back.',
		},
	])
})

test("a part not connected to ground still solves, with a warning", () => {
	const circuit = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
			{ id: "R1", type: "resistor", params: { resistance: 2 } },
			{ id: "GND", type: "ground", params: {} },
			{ id: "R9", type: "resistor", params: { resistance: 10 } },
		],
		[
			["V1.positive", "R1.a"],
			["R1.b", "V1.negative"],
			["V1.negative", "GND.terminal"],
		],
	)
	const result = solveDc(circuit)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))

	expectClose(result.solution.readings.R1?.current, 3)
	expect(result.solution.readings.R9).toEqual({ voltage: 0, current: 0 })
	expect(result.solution.warnings).toEqual([
		{
			componentIds: ["R9"],
			message: 'Not connected to ground: "R9". Its voltages are measured from "R9" pin "a".',
		},
	])
})

test("a circuit without ground is measured from the battery's negative pin", () => {
	const circuit = circuitOf(
		[
			{ id: "R1", type: "resistor", params: { resistance: 2 } },
			{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
		],
		[
			["V1.positive", "R1.a"],
			["R1.b", "V1.negative"],
		],
	)
	const result = solveDc(circuit)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))

	expectClose(result.solution.pinVoltages["V1:positive"], 6)
	expectClose(result.solution.pinVoltages["V1:negative"], 0)
	expect(result.solution.warnings).toEqual([
		{
			componentIds: ["R1", "V1"],
			message: 'Not connected to ground: "R1", "V1". Their voltages are measured from "V1" pin "negative".',
		},
	])
})
