import type { Circuit } from "@ohmwork/format"
import { expect, test } from "vitest"
import { advanceTransient, usesFixedSteps } from "../../src/transient/adaptive"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

const rc = () =>
	circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)

function advance(circuit: Circuit, until: number, maxStep: number) {
	const result = advanceTransient(circuit, initialTransientState(), until, { maxStep })
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result
}

test("an RC charge is followed to 0.1% with far fewer steps than a fixed 10 µs step needs", () => {
	for (const [time, expected] of [
		[1e-3, 3.1606],
		[2e-3, 4.32332],
		[5e-3, 4.96631],
	] as const) {
		const result = advance(rc(), time, 1e-3)
		const voltage = result.solution.readings.C1?.voltage ?? 0
		expect(Math.abs(voltage - expected), `at ${time} s`).toBeLessThan(expected * 1e-3)
		expect(result.state.time).toBeCloseTo(time, 15)
	}
	expect(advance(rc(), 5e-3, 1e-3).steps).toBeLessThan(150)
})

test("a ringing RLC still matches ngspice within 1% (4.97235, 9.75669, 0.476638 V)", () => {
	const rlc = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 1 } },
			{ id: "L1", type: "inductor", params: { inductance: 1e-3 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "L1.a"], ["L1.b", "C1.a"], ["C1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	for (const [time, expected] of [
		[50e-6, 4.97235],
		[100e-6, 9.75669],
		[200e-6, 0.476638],
	] as const) {
		const voltage = advance(rlc, time, 5e-6).solution.readings.C1?.voltage ?? 0
		expect(Math.abs(voltage - expected), `at ${time} s`).toBeLessThan(Math.abs(expected) * 0.01)
	}
})

test("a square wave's edges are hit exactly: no step jumps over one", () => {
	const square = circuitOf(
		[
			{ id: "SQ", type: "square-source", params: { low: 0, high: 5, frequency: 1000, dutyCycle: 0.5 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 0.1e-6 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["SQ.positive", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "GND.terminal"], ["SQ.negative", "GND.terminal"]],
	)
	const times: number[] = []
	const result = advanceTransient(square, initialTransientState(), 1.2e-3, { maxStep: 1e-3, onStep: (state) => times.push(state.time) })
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expect(times.some((time) => Math.abs(time - 0.5e-3) < 1e-15)).toBe(true)
	expect(times.some((time) => Math.abs(time - 1e-3) < 1e-15)).toBe(true)
	// τ = 0.1 ms: charged for 0.5 ms (high), discharged for 0.5 ms (low), then charging again for 0.2 ms.
	const afterLow = 5 * (1 - Math.exp(-5)) * Math.exp(-5)
	const expected = 5 - (5 - afterLow) * Math.exp(-2)
	expect(Math.abs((result.solution.readings.C1?.voltage ?? 0) - expected)).toBeLessThan(expected * 5e-3)
})

test("circuits with logic, clocks, a 555 or a relay keep fixed steps (their timing is one step per gate, ADR-018)", () => {
	expect(usesFixedSteps(rc())).toBe(false)
	const withClock = circuitOf([{ id: "CLK1", type: "clock", params: {} }], [])
	expect(usesFixedSteps(withClock)).toBe(true)
	const withGate = circuitOf([{ id: "N1", type: "not-gate", params: {} }], [])
	expect(usesFixedSteps(withGate)).toBe(true)
})

test("fixed stepping steps exactly as stepTransient does", () => {
	const circuit = { ...rc(), simulation: { ...rc().simulation, stepping: "fixed" as const } }
	let state = initialTransientState()
	for (let step = 0; step < 100; step++) {
		const result = stepTransient(circuit, state, { timeStep: 1e-5 })
		if (!result.ok) throw new Error("step failed")
		state = result.state
	}
	const fixed = advanceTransient(circuit, initialTransientState(), 1e-3, { maxStep: 1e-5 })
	if (!fixed.ok) throw new Error("advance failed")
	expect(fixed.steps).toBe(100)
	expect(fixed.solution.readings.C1?.voltage).toBe(state.memory["C1"]?.voltage)
})
