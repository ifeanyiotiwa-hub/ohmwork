// LM741 (TI SNOSC25D, rev. Oct 2015): slew rate 0.5 V/µs, output short-circuit current 25 mA, unity-gain rise
// time 0.3 µs, so a gain-bandwidth of 0.35 / 0.3 µs = 1.17 MHz (the datasheet's own formula).
import type { Circuit } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

/** Steps a circuit and returns the largest value of `reading` between `from` and `until` seconds. */
function peakBetween(circuit: Circuit, timeStep: number, from: number, until: number, reading: (pins: Record<string, number>) => number) {
	let state = initialTransientState()
	let peak = Number.NEGATIVE_INFINITY
	for (let step = 1; step <= Math.round(until / timeStep); step++) {
		const result = stepTransient(circuit, state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		if (state.time >= from) peak = Math.max(peak, reading(result.solution.pinVoltages))
	}
	return peak
}

const amplifierAt = (frequency: number) =>
	circuitOf(
		[
			{ id: "VIN", type: "ac-source", params: { amplitude: 0.01, frequency, offset: 0, phase: 0, delay: 0 } },
			{ id: "U1", type: "op-amp", params: {} },
			{ id: "RF", type: "resistor", params: { resistance: 9000 } },
			{ id: "RG", type: "resistor", params: { resistance: 1000 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VIN.positive", "U1.nonInverting"],
			["VIN.negative", "GND.terminal"],
			["U1.output", "RF.a"],
			["RF.b", "U1.inverting"],
			["U1.inverting", "RG.a"],
			["RG.b", "GND.terminal"],
		],
	)

test("gain-bandwidth: a ×10 amplifier rolls off as ngspice's single-pole model says (70.6 mV at 117 kHz, 36.2 mV at 300 kHz)", () => {
	const output = (pins: Record<string, number>) => pins["U1:output"] ?? 0
	const at117k = peakBetween(amplifierAt(117e3), 1e-8, 150e-6, 200e-6, output)
	const at300k = peakBetween(amplifierAt(300e3), 1e-8, 150e-6, 200e-6, output)
	expect(Math.abs(at117k - 0.0706061)).toBeLessThan(0.0706061 * 0.01)
	expect(Math.abs(at300k - 0.0362432)).toBeLessThan(0.0362432 * 0.01)
})

test("slew rate: a follower given a 5 V step ramps at 0.5 V/µs and arrives after 10 µs", () => {
	const follower = circuitOf(
		[
			{ id: "SQ", type: "square-source", params: { low: 0, high: 5, frequency: 1000, dutyCycle: 0.5 } },
			{ id: "U1", type: "op-amp", params: {} },
			{ id: "GND", type: "ground", params: {} },
		],
		[["SQ.positive", "U1.nonInverting"], ["SQ.negative", "GND.terminal"], ["U1.output", "U1.inverting"]],
	)
	const at = (seconds: number) => {
		let state = initialTransientState()
		let output = 0
		for (let step = 1; step <= Math.round(seconds / 1e-7); step++) {
			const result = stepTransient(follower, state, { timeStep: 1e-7 })
			if (!result.ok) throw new Error(JSON.stringify(result.errors))
			state = result.state
			output = result.solution.pinVoltages["U1:output"] ?? 0
		}
		return output
	}
	expect(Math.abs(at(4e-6) - 2)).toBeLessThan(0.05)
	expect(Math.abs(at(12e-6) - 5)).toBeLessThan(0.01)
})

test("output current limit: a follower at 10 V into 100 Ω delivers 25 mA (2.5 V), not 100 mA", () => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 10 } },
				{ id: "U1", type: "op-amp", params: {} },
				{ id: "RL", type: "resistor", params: { resistance: 100, powerRating: 10 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "U1.nonInverting"], ["V1.negative", "GND.terminal"], ["U1.output", "U1.inverting"], ["U1.output", "RL.a"], ["RL.b", "GND.terminal"]],
		),
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expect(Math.abs(result.solution.readings.RL?.current ?? 0)).toBeCloseTo(0.025, 4)
})
