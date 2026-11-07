import { expect, test } from "vitest"
import { OHMMETER_TEST_CURRENT } from "../../src/dc/branches"
import { type DcInputs, solveDc } from "../../src/dc/solve-dc"
import { circuitOf, expectClose } from "../support/circuit-of"

type Circuit = ReturnType<typeof circuitOf>

const solutionOf = (circuit: Circuit, inputs?: DcInputs) => {
	const result = solveDc(circuit, inputs)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution
}

/** 6 V across R1 = 1 Ω and R2 = 2 Ω in series (the KVL example: R2 gets 4 V at 2 A). */
const divider = (extra: Parameters<typeof circuitOf>[0], wires: Parameters<typeof circuitOf>[1], between: Parameters<typeof circuitOf>[1][number] = ["R1.b", "R2.a"]) =>
	circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
			{ id: "R1", type: "resistor", params: { resistance: 1 } },
			{ id: "R2", type: "resistor", params: { resistance: 2 } },
			{ id: "GND", type: "ground", params: {} },
			...extra,
		],
		[["V1.positive", "R1.a"], between, ["R2.b", "GND.terminal"], ["V1.negative", "GND.terminal"], ...wires],
	)

test("a voltmeter reads the voltage across what it touches and draws no current", () => {
	const { readings } = solutionOf(
		divider([{ id: "VM1", type: "voltmeter", params: {} }], [["VM1.positive", "R2.a"], ["VM1.negative", "R2.b"]]),
	)
	expectClose(readings.VM1?.voltage, 4)
	expect(readings.VM1?.current).toBe(0)
	expectClose(readings.R2?.current, 2)
})

test("an ammeter in series reads the loop current and drops no voltage", () => {
	const { readings } = solutionOf(
		divider([{ id: "AM1", type: "ammeter", params: {} }], [["AM1.negative", "R2.a"]], ["R1.b", "AM1.positive"]),
	)
	expectClose(readings.AM1?.current, 2)
	expectClose(readings.AM1?.voltage, 0)
	expectClose(readings.R2?.voltage, 4)
})

test("an ammeter straight across a battery is a short circuit, as in real life", () => {
	const circuit = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
			{ id: "AM1", type: "ammeter", params: {} },
		],
		[["V1.positive", "AM1.positive"], ["AM1.negative", "V1.negative"]],
	)
	const result = solveDc(circuit)
	expect(result.ok).toBe(false)
	expect(result.ok ? "" : result.errors[0]?.message).toContain("Short circuit")
})

const ohmmeterAcross = (parts: Parameters<typeof circuitOf>[0], wires: Parameters<typeof circuitOf>[1]) =>
	circuitOf([{ id: "OM1", type: "ohmmeter", params: {} }, ...parts], wires)

test("an ohmmeter reads the resistance of an unpowered network, without needing ground", () => {
	const result = solveDc(
		ohmmeterAcross(
			[
				{ id: "R1", type: "resistor", params: { resistance: 100 } },
				{ id: "R2", type: "resistor", params: { resistance: 300 } },
			],
			[["OM1.a", "R1.a"], ["R1.b", "R2.a"], ["R2.b", "OM1.b"]],
		),
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expectClose(result.solution.readings.OM1?.resistance, 400)
	expectClose(result.solution.readings.R1?.current, OHMMETER_TEST_CURRENT)
	expect(result.solution.warnings).toEqual([])
})

test("an ohmmeter with nothing between its leads reads open instead of failing", () => {
	const { readings } = solutionOf(
		ohmmeterAcross([{ id: "R1", type: "resistor", params: { resistance: 100 } }], [["OM1.a", "R1.a"]]),
	)
	expect(readings.OM1?.resistance).toBe(Number.POSITIVE_INFINITY)
	expect(readings.OM1?.current).toBe(0)
})

test("an ohmmeter on a powered circuit warns that its reading is not a resistance", () => {
	const { warnings } = solutionOf(
		divider([{ id: "OM1", type: "ohmmeter", params: {} }], [["OM1.a", "R2.a"], ["OM1.b", "R2.b"]]),
	)
	expect(warnings).toContainEqual({
		componentIds: ["OM1"],
		message: 'Ohmmeter "OM1" is measuring a powered circuit, so its reading is not a resistance. Measure with the power off.',
	})
})

const buttonCircuit = (normallyOpen: boolean) =>
	circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "PB1", type: "push-button", params: { normallyOpen } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "PB1.a"], ["PB1.b", "R1.a"], ["R1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)

test("a normally-open push button conducts only while pressed", () => {
	expectClose(solutionOf(buttonCircuit(true)).readings.R1?.current, 0)
	expectClose(solutionOf(buttonCircuit(true), { pressed: new Set(["PB1"]) }).readings.R1?.current, 0.005)
})

test("a normally-closed push button conducts until pressed", () => {
	expectClose(solutionOf(buttonCircuit(false)).readings.R1?.current, 0.005)
	expectClose(solutionOf(buttonCircuit(false), { pressed: new Set(["PB1"]) }).readings.R1?.current, 0)
})
