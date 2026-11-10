import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { wireCurrents } from "../../src/dc/wire-currents"
import { circuitOf, expectClose } from "../support/circuit-of"

const solved = (circuit: ReturnType<typeof circuitOf>) => {
	const result = solveDc(circuit)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return wireCurrents(circuit, result.solution)
}

test("series loop: every wire carries the loop current, signed by wire direction", () => {
	const currents = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
				{ id: "R1", type: "resistor", params: { resistance: 3 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["R1.b", "V1.negative"],
				["GND.terminal", "V1.negative"],
			],
		),
	)

	expectClose(currents.w1, 2)
	expectClose(currents.w2, 2)
	expectClose(currents.w3, 0)
})

test("a wire listed against the flow reads negative", () => {
	const currents = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
				{ id: "R1", type: "resistor", params: { resistance: 3 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["R1.a", "V1.positive"],
				["R1.b", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		),
	)

	expectClose(currents.w1, -2)
	expectClose(currents.w2, 2)
	expectClose(currents.w3, -2)
})

test("a junction splits current between branches (KCL)", () => {
	const currents = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
				{ id: "R1", type: "resistor", params: { resistance: 2 } },
				{ id: "R2", type: "resistor", params: { resistance: 3 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["R1.a", "R2.a"],
				["R1.b", "GND.terminal"],
				["R2.b", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		),
	)

	expectClose(currents.w1, 5)
	expectClose(currents.w2, 2)
	expectClose(currents.w3, 3)
	expectClose(currents.w4, 2)
	expectClose(currents.w5, -5)
	expect(Object.keys(currents)).toHaveLength(5)
})

test("a loop of wires inside one node still delivers the right total current", () => {
	const currents = solved(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
				{ id: "R1", type: "resistor", params: { resistance: 3 } },
				{ id: "R2", type: "resistor", params: { resistance: 3 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["R1.a", "R2.a"],
				["R2.a", "V1.positive"],
				["R1.b", "GND.terminal"],
				["R2.b", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		),
	)

	const leavingBatteryNode = (currents.w1 ?? 0) - (currents.w3 ?? 0)
	expectClose(leavingBatteryNode, 4)
})

test("net labels join a circuit without a wire, and the wires on both sides carry its current", () => {
	// 6 V into 3 Ω, the supply reaching the resistor only through two labels named "VCC".
	const circuit = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
			{ id: "NL1", type: "net-label", params: { name: "VCC" } },
			{ id: "NL2", type: "net-label", params: { name: "vcc" } },
			{ id: "R1", type: "resistor", params: { resistance: 3, powerRating: 20 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["V1.positive", "NL1.terminal"],
			["NL2.terminal", "R1.a"],
			["R1.b", "GND.terminal"],
			["V1.negative", "GND.terminal"],
		],
	)
	const result = solveDc(circuit)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expectClose(result.solution.readings.R1?.current, 2)
	expect(result.solution.warnings).toEqual([])
	const currents = wireCurrents(circuit, result.solution)
	expectClose(Math.abs(currents.w1 ?? 0), 2)
	expectClose(Math.abs(currents.w2 ?? 0), 2)
})
