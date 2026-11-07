import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf, expectClose } from "../support/circuit-of"

type Parts = Parameters<typeof circuitOf>[0]
type Wires = Parameters<typeof circuitOf>[1]

const solutionOf = (parts: Parts, wires: Wires) => {
	const result = solveDc(circuitOf(parts, wires))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution
}

/** A 6 V source across R1 = 1 Ω and R2 = 2 Ω: 4 V across R2, 2 A in the loop. */
const kvl: Parts = [
	{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
	{ id: "R1", type: "resistor", params: { resistance: 1 } },
	{ id: "R2", type: "resistor", params: { resistance: 2 } },
	{ id: "GND", type: "ground", params: {} },
	{ id: "RL", type: "resistor", params: { resistance: 1000 } },
]
const kvlWires: Wires = [["V1.positive", "R1.a"], ["R1.b", "R2.a"], ["R2.b", "GND.terminal"], ["V1.negative", "GND.terminal"]]

test("a VCVS multiplies the voltage between its control pins (SPICE E)", () => {
	const { readings } = solutionOf(
		[...kvl, { id: "E1", type: "vcvs", params: { gain: 2 } }],
		[...kvlWires, ["E1.controlPositive", "R2.a"], ["E1.controlNegative", "R2.b"], ["E1.positive", "RL.a"], ["E1.negative", "GND.terminal"], ["RL.b", "GND.terminal"]],
	)
	expectClose(readings.RL?.voltage, 8)
	expectClose(readings.R2?.current, 2)
})

test("a VCCS pushes transconductance × control voltage out of its positive pin (SPICE G)", () => {
	const { readings } = solutionOf(
		[...kvl, { id: "G1", type: "vccs", params: { transconductance: 0.001 } }],
		[...kvlWires, ["G1.controlPositive", "R2.a"], ["G1.controlNegative", "R2.b"], ["G1.positive", "RL.a"], ["G1.negative", "GND.terminal"], ["RL.b", "GND.terminal"]],
	)
	expectClose(readings.RL?.current, 0.004)
	expectClose(readings.RL?.voltage, 4)
})

test("a CCVS turns the current through its sense pins into a voltage (SPICE H)", () => {
	const { readings } = solutionOf(
		[...kvl, { id: "H1", type: "ccvs", params: { transresistance: 3 } }],
		[["V1.positive", "R1.a"], ["R1.b", "H1.senseIn"], ["H1.senseOut", "R2.a"], ["R2.b", "GND.terminal"], ["V1.negative", "GND.terminal"], ["H1.positive", "RL.a"], ["H1.negative", "GND.terminal"], ["RL.b", "GND.terminal"]],
	)
	expectClose(readings.R2?.current, 2)
	expectClose(readings.RL?.voltage, 6)
})

test("a CCCS pushes gain × sensed current out of its positive pin (SPICE F)", () => {
	const { readings } = solutionOf(
		[...kvl.slice(0, 4), { id: "F1", type: "cccs", params: { gain: 0.5 } }, { id: "RL", type: "resistor", params: { resistance: 1 } }],
		[["V1.positive", "R1.a"], ["R1.b", "F1.senseIn"], ["F1.senseOut", "R2.a"], ["R2.b", "GND.terminal"], ["V1.negative", "GND.terminal"], ["F1.positive", "RL.a"], ["F1.negative", "GND.terminal"], ["RL.b", "GND.terminal"]],
	)
	expectClose(readings.RL?.current, 1)
})

const potCircuit = (position: number) =>
	solutionOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 10 } },
			{ id: "POT1", type: "potentiometer", params: { resistance: 1000, position } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "POT1.a"], ["POT1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)

test("a potentiometer's wiper divides the voltage by its position", () => {
	expectClose(potCircuit(0.25).pinVoltages["POT1:wiper"], 7.5)
	expectClose(potCircuit(0).pinVoltages["POT1:wiper"], 10)
	expectClose(potCircuit(1).pinVoltages["POT1:wiper"], 0)
})

test("a lamp is a resistor of V²/P: a 6 V 1 W lamp on 6 V draws 1/6 A", () => {
	const { readings } = solutionOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 6 } },
			{ id: "LMP1", type: "lamp", params: { ratedVoltage: 6, ratedPower: 1 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "LMP1.a"], ["LMP1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	expectClose(readings.LMP1?.current, 1 / 6)
})

test("an SPDT switch connects its common pin to the selected side only", () => {
	const spdt = (position: "a" | "b") =>
		solutionOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "SW1", type: "switch-spdt", params: { position } },
				{ id: "RA", type: "resistor", params: { resistance: 100 } },
				{ id: "RB", type: "resistor", params: { resistance: 100 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "SW1.common"], ["SW1.a", "RA.a"], ["SW1.b", "RB.a"], ["RA.b", "GND.terminal"], ["RB.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		)
	expectClose(spdt("a").readings.RA?.current, 0.05)
	expect(spdt("a").readings.RB?.current).toBe(0)
	expectClose(spdt("b").readings.RB?.current, 0.05)
})

test("a polarized capacitor wired backwards beyond its limit is a warning", () => {
	const { warnings } = solutionOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "CP1", type: "polarized-capacitor", params: { capacitance: 1e-5, maxReverseVoltage: 1 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "CP1.negative"], ["CP1.positive", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	expect(warnings).toContainEqual({
		componentIds: ["CP1"],
		message:
			'Polarized capacitor "CP1" is reversed: its negative pin is 5 V above its positive pin (limit 1 V). A real one could fail; turn it around.',
	})
})

const transformer = (load: number) =>
	circuitOf(
		[
			{ id: "AC1", type: "ac-source", params: { amplitude: 10, frequency: 1000, offset: 0, phase: 0, delay: 0 } },
			{ id: "T1", type: "transformer", params: { primaryInductance: 4, turnsRatio: 2, coupling: 0.999 } },
			{ id: "RL", type: "resistor", params: { resistance: load } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["AC1.positive", "T1.primaryA"],
			["T1.primaryB", "GND.terminal"],
			["AC1.negative", "GND.terminal"],
			["T1.secondaryA", "RL.a"],
			["T1.secondaryB", "GND.terminal"],
			["RL.b", "GND.terminal"],
		],
	)

function secondaryPeak(load: number): number {
	let state = initialTransientState()
	let peak = 0
	const timeStep = 1e-6
	for (let step = 1; step <= 5000; step++) {
		const result = stepTransient(transformer(load), state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		if (state.time >= 4e-3) peak = Math.max(peak, result.solution.readings.RL?.voltage ?? 0)
	}
	return peak
}

test("a transformer steps a sine up by its turns ratio (ngspice K: 19.9799 V light, 19.5883 V with 1 kΩ)", () => {
	expect(Math.abs(secondaryPeak(1e6) - 19.9799)).toBeLessThan(19.9799 * 0.01)
	expect(Math.abs(secondaryPeak(1000) - 19.5883)).toBeLessThan(19.5883 * 0.01)
})

test("at DC a transformer's windings are plain wires, so a battery across one is a short circuit", () => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "T1", type: "transformer", params: { primaryInductance: 4, turnsRatio: 1, coupling: 0.999 } },
			],
			[["V1.positive", "T1.primaryA"], ["T1.primaryB", "V1.negative"]],
		),
	)
	expect(result.ok ? "" : result.errors[0]?.message).toContain("Short circuit")
})
