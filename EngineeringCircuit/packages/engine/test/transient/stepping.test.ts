import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { isTimeDependent, initialTransientState, stepTransient } from "../../src/transient/step"
import { acVoltage, squareVoltage } from "../../src/transient/waveforms"
import { circuitOf } from "../support/circuit-of"

test("a sine follows SPICE SIN: offset + amplitude·sin(2πf(t − delay) + phase)", () => {
	const sine = { amplitude: 2, frequency: 50, offset: 1, phase: 90, delay: 0 }
	expect(acVoltage(sine, 0)).toBeCloseTo(3, 12)
	expect(acVoltage(sine, 0.01)).toBeCloseTo(-1, 12)
	expect(acVoltage({ ...sine, delay: 0.5 }, 0.2)).toBeCloseTo(3, 12)
})

test("a square wave is high for the duty cycle at the start of each period", () => {
	const square = { low: 0, high: 5, frequency: 10, dutyCycle: 0.25 }
	expect(squareVoltage(square, 0)).toBe(5)
	expect(squareVoltage(square, 0.024)).toBe(5)
	expect(squareVoltage(square, 0.026)).toBe(0)
	expect(squareVoltage(square, 0.101)).toBe(5)
})

const charging = (resistance: number) =>
	circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)

test("editing the circuit mid-run keeps the capacitor's charge", () => {
	let state = initialTransientState()
	for (let step = 0; step < 100; step++) {
		const result = stepTransient(charging(1000), state, { timeStep: 1e-5 })
		if (!result.ok) throw new Error("step failed")
		state = result.state
	}
	const charged = state.memory.C1?.voltage ?? 0
	const next = stepTransient(charging(2000), state, { timeStep: 1e-5 })
	if (!next.ok) throw new Error("step failed")
	expect(next.solution.readings.C1?.voltage).toBeGreaterThan(charged)
	expect(next.state.time).toBeCloseTo(1.01e-3, 12)
})

test("circuits with capacitors, inductors or wave sources change over time; plain DC ones don't", () => {
	expect(isTimeDependent(charging(1000))).toBe(true)
	expect(
		isTimeDependent(
			circuitOf(
				[
					{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
					{ id: "R1", type: "resistor", params: { resistance: 10 } },
				],
				[["V1.positive", "R1.a"], ["R1.b", "V1.negative"]],
			),
		),
	).toBe(false)
})

test("a wave source in a plain DC solve uses SPICE's DC value: the offset, or the low level", () => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "AC1", type: "ac-source", params: { amplitude: 5, frequency: 40, offset: 1.5, phase: 90, delay: 0 } },
				{ id: "R1", type: "resistor", params: { resistance: 10 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[["AC1.positive", "R1.a"], ["R1.b", "GND.terminal"], ["AC1.negative", "GND.terminal"]],
		),
	)
	expect(result.ok && result.solution.readings.R1?.voltage).toBeCloseTo(1.5, 12)
})

test("a square source drives a circuit: its low level at DC, then high for the duty fraction of each period over time", () => {
	const circuit = circuitOf(
		[
			{ id: "SQ1", type: "square-source", params: { low: 1, high: 4, frequency: 1000, dutyCycle: 0.25 } },
			{ id: "R1", type: "resistor", params: { resistance: 100 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["SQ1.positive", "R1.a"], ["R1.b", "GND.terminal"], ["SQ1.negative", "GND.terminal"]],
	)
	const dc = solveDc(circuit)
	expect(dc.ok && dc.solution.readings.R1?.voltage).toBeCloseTo(1, 12)

	const voltageAt = new Map<number, number>()
	let state = initialTransientState()
	for (let step = 0; step < 150; step++) {
		const result = stepTransient(circuit, state, { timeStep: 1e-5 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		voltageAt.set(Math.round(state.time * 1e5), result.solution.readings.R1?.voltage ?? Number.NaN)
	}
	// Steps are 10 µs: high during 0–250 µs of each 1 ms period, low otherwise.
	expect(voltageAt.get(10)).toBeCloseTo(4, 12)
	expect(voltageAt.get(50)).toBeCloseTo(1, 12)
	expect(voltageAt.get(110)).toBeCloseTo(4, 12)
	expect(voltageAt.get(140)).toBeCloseTo(1, 12)
})
