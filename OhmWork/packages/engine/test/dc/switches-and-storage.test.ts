import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { circuitOf, expectClose } from "../support/circuit-of"

const seriesWith = (third: Parameters<typeof circuitOf>[0][number]) =>
	circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 100 } },
			third,
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["V1.positive", "R1.a"],
			["R1.b", `${third.id}.a`],
			[`${third.id}.b`, "GND.terminal"],
			["V1.negative", "GND.terminal"],
		],
	)

const solutionOf = (circuit: ReturnType<typeof circuitOf>) => {
	const result = solveDc(circuit)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution
}

test("closed switch conducts like a wire", () => {
	const { readings } = solutionOf(seriesWith({ id: "S1", type: "switch", params: { closed: true } }))

	expectClose(readings.S1?.current, 0.05)
	expectClose(readings.S1?.voltage, 0)
	expectClose(readings.R1?.current, 0.05)
})

test("open switch blocks current and takes the full source voltage", () => {
	const { readings } = solutionOf(seriesWith({ id: "S1", type: "switch", params: { closed: false } }))

	expect(readings.S1?.current).toBe(0)
	expectClose(readings.R1?.current, 0)
	expectClose(readings.S1?.voltage, 5)
})

test("at DC a charged capacitor blocks current and holds the source voltage", () => {
	const { readings } = solutionOf(seriesWith({ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } }))

	expect(readings.C1?.current).toBe(0)
	expectClose(readings.C1?.voltage, 5)
})

test("at DC an inductor is a wire: I = V / R", () => {
	const { readings } = solutionOf(seriesWith({ id: "L1", type: "inductor", params: { inductance: 1e-3 } }))

	expectClose(readings.L1?.current, 0.05)
	expectClose(readings.L1?.voltage, 0)
})
