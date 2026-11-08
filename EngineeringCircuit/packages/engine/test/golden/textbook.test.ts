import { describe, expect, test } from "vitest"
import { type DcSolution, solveDc } from "../../src/dc/solve-dc"
import { circuitOf, expectClose } from "../support/circuit-of"
import type { Circuit } from "@engineering-circuit/format"

const solved = (circuit: Circuit): DcSolution => {
	const result = solveDc(circuit)
	if (!result.ok) throw new Error(`expected a solution, got ${JSON.stringify(result.errors)}`)
	return result.solution
}

describe("Ohm's law", () => {
	const solution = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 10 } },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["R1.b", "V1.negative"],
				["V1.negative", "GND.terminal"],
			],
		),
	)

	test("I = V / R = 10 mA through the resistor", () => {
		expectClose(solution.readings.R1?.current, 0.01)
		expectClose(solution.readings.R1?.voltage, 10)
	})

	test("the source supplies the same current (negative = supplying)", () => {
		expectClose(solution.readings.V1?.current, -0.01)
		expectClose(solution.readings.V1?.voltage, 10)
	})
})

test("voltage divider: two equal resistors split 10 V into 5 V", () => {
	const solution = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 10 } },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "R2", type: "resistor", params: { resistance: 1000 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["R1.b", "R2.a"],
				["R2.b", "V1.negative"],
				["V1.negative", "GND.terminal"],
			],
		),
	)

	expectClose(solution.pinVoltages["R1:b"], 5)
	expectClose(solution.pinVoltages["V1:positive"], 10)
	expectClose(solution.pinVoltages["GND:terminal"], 0)
})

test("KVL: 6 V across 1 Ω and 2 Ω drops 2 V and 4 V with 2 A flowing", () => {
	const solution = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
				{ id: "R1", type: "resistor", params: { resistance: 1 } },
				{ id: "R2", type: "resistor", params: { resistance: 2 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["R1.b", "R2.a"],
				["R2.b", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		),
	)

	expectClose(solution.readings.R1?.voltage, 2)
	expectClose(solution.readings.R2?.voltage, 4)
	expectClose(solution.readings.R1?.current, 2)
	expectClose(solution.readings.R2?.current, 2)
	expectClose(solution.pinVoltages["R1:b"], 4)
})

test("series-parallel: 12 V, 2 Ω in series with 6 Ω ∥ 3 Ω", () => {
	const solution = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 12 } },
				{ id: "R1", type: "resistor", params: { resistance: 2 } },
				{ id: "R2", type: "resistor", params: { resistance: 6 } },
				{ id: "R3", type: "resistor", params: { resistance: 3 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["R1.b", "R2.a"],
				["R1.b", "R3.a"],
				["R2.b", "GND.terminal"],
				["R3.b", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		),
	)

	expectClose(solution.readings.R1?.current, 3)
	expectClose(solution.pinVoltages["R1:b"], 6)
	expectClose(solution.readings.R2?.current, 1)
	expectClose(solution.readings.R3?.current, 2)
})

test("current source: 2 mA into 1 kΩ gives 2 V", () => {
	const solution = solved(
		circuitOf(
			[
				{ id: "I1", type: "current-source", params: { current: 0.002 } },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["I1.positive", "R1.a"],
				["R1.b", "GND.terminal"],
				["I1.negative", "GND.terminal"],
			],
		),
	)

	expectClose(solution.pinVoltages["R1:a"], 2)
	expectClose(solution.readings.R1?.current, 0.002)
	expectClose(solution.readings.I1?.current, -0.002)
})

test("KCL current divider: 3 A into 1 Ω ∥ 2 Ω splits 2 A and 1 A", () => {
	const solution = solved(
		circuitOf(
			[
				{ id: "I1", type: "current-source", params: { current: 3 } },
				{ id: "R1", type: "resistor", params: { resistance: 1 } },
				{ id: "R2", type: "resistor", params: { resistance: 2 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["I1.positive", "R1.a"],
				["I1.positive", "R2.a"],
				["R1.b", "GND.terminal"],
				["R2.b", "GND.terminal"],
				["I1.negative", "GND.terminal"],
			],
		),
	)

	expectClose(solution.pinVoltages["R1:a"], 2)
	expectClose(solution.readings.R1?.current, 2)
	expectClose(solution.readings.R2?.current, 1)
})

test("separate ground symbols are the same node", () => {
	const solution = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 9 } },
				{ id: "R1", type: "resistor", params: { resistance: 3, powerRating: 100 } },
				{ id: "G1", type: "ground", params: {} },
				{ id: "G2", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["R1.b", "G1.terminal"],
				["V1.negative", "G2.terminal"],
			],
		),
	)

	expectClose(solution.readings.R1?.current, 3)
	expect(solution.warnings).toEqual([])
})
