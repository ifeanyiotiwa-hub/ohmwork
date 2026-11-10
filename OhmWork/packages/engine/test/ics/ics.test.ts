import type { Circuit } from "@ohmwork/format"
import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

type Parts = Parameters<typeof circuitOf>[0]
type Wires = Parameters<typeof circuitOf>[1]
const OP_AMP = { gain: 100000, supplyHigh: 15, supplyLow: -15 }

function outputOf(parts: Parts, wires: Wires): number {
	const result = solveDc(circuitOf(parts, wires))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution.pinVoltages["U1:output"] ?? Number.NaN
}

const inverting = (input: number) =>
	outputOf(
		[
			{ id: "VIN", type: "voltage-source", params: { voltage: input } },
			{ id: "RIN", type: "resistor", params: { resistance: 1000 } },
			{ id: "RF", type: "resistor", params: { resistance: 10000 } },
			{ id: "U1", type: "op-amp", params: OP_AMP },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VIN.positive", "RIN.a"],
			["RIN.b", "U1.inverting"],
			["U1.inverting", "RF.a"],
			["RF.b", "U1.output"],
			["U1.nonInverting", "GND.terminal"],
			["VIN.negative", "GND.terminal"],
		],
	)

/** Closed-loop output with a finite open-loop gain A: ideal × 1 / (1 + noise gain / A). */
const withFiniteGain = (ideal: number, noiseGain: number) => ideal / (1 + noiseGain / OP_AMP.gain)
/** Within 0.03% (ADR-019): the smooth output limit costs a little gain as the output nears a supply limit. */
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(Math.abs(expected) * 3e-4)

test("an inverting amplifier has gain −Rf/Rin = −10 (less a hair for the finite gain)", () => {
	near(inverting(0.5), withFiniteGain(-5, 11))
	near(inverting(-0.3), withFiniteGain(3, 11))
})

test("an op-amp output stops at its supply limits", () => {
	expect(Math.abs(inverting(2) + 15)).toBeLessThan(0.01)
	expect(Math.abs(inverting(-5) - 15)).toBeLessThan(0.01)
})

test("a non-inverting amplifier has gain 1 + Rf/Rg = 11; a follower has gain 1", () => {
	const nonInverting = outputOf(
		[
			{ id: "VIN", type: "voltage-source", params: { voltage: 1 } },
			{ id: "RG", type: "resistor", params: { resistance: 1000 } },
			{ id: "RF", type: "resistor", params: { resistance: 10000 } },
			{ id: "U1", type: "op-amp", params: OP_AMP },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VIN.positive", "U1.nonInverting"],
			["U1.inverting", "RG.a"],
			["RG.b", "GND.terminal"],
			["U1.inverting", "RF.a"],
			["RF.b", "U1.output"],
			["VIN.negative", "GND.terminal"],
		],
	)
	near(nonInverting, withFiniteGain(11, 11))
	const follower = outputOf(
		[
			{ id: "VIN", type: "voltage-source", params: { voltage: 2.5 } },
			{ id: "U1", type: "op-amp", params: OP_AMP },
			{ id: "GND", type: "ground", params: {} },
		],
		[["VIN.positive", "U1.nonInverting"], ["U1.output", "U1.inverting"], ["VIN.negative", "GND.terminal"]],
	)
	expect(follower).toBeCloseTo(2.5, 4)
})

test("open loop, an op-amp is a comparator: the output swings to the side of the larger input", () => {
	const compare = (plus: number, minus: number) =>
		outputOf(
			[
				{ id: "VP", type: "voltage-source", params: { voltage: plus } },
				{ id: "VM", type: "voltage-source", params: { voltage: minus } },
				{ id: "U1", type: "op-amp", params: OP_AMP },
				{ id: "GND", type: "ground", params: {} },
			],
			[["VP.positive", "U1.nonInverting"], ["VM.positive", "U1.inverting"], ["VP.negative", "GND.terminal"], ["VM.negative", "GND.terminal"]],
		)
	expect(compare(1, 0.9)).toBeCloseTo(15, 2)
	expect(compare(0.9, 1)).toBeCloseTo(-15, 2)
})

const astable = (reset: "vcc" | "ground") =>
	circuitOf(
		[
			{ id: "VR1", type: "voltage-rail", params: { voltage: 9 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "R2", type: "resistor", params: { resistance: 10000 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "IC1", type: "timer-555", params: {} },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VR1.terminal", "IC1.vcc"],
			["VR1.terminal", "R1.a"],
			["R1.b", "IC1.discharge"],
			["IC1.discharge", "R2.a"],
			["R2.b", "IC1.threshold"],
			["IC1.threshold", "IC1.trigger"],
			["IC1.threshold", "C1.a"],
			["C1.b", "GND.terminal"],
			["IC1.ground", "GND.terminal"],
			reset === "vcc" ? ["IC1.reset", "VR1.terminal"] : ["IC1.reset", "GND.terminal"],
		],
	)

function outputEdges(circuit: Circuit, seconds: number, timeStep: number) {
	let state = initialTransientState()
	let high: boolean | undefined
	const rising: number[] = []
	const falling: number[] = []
	for (let step = 1; step <= Math.round(seconds / timeStep); step++) {
		const result = stepTransient(circuit, state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		const now = (result.solution.pinVoltages["IC1:output"] ?? 0) > 4.5
		if (high !== undefined && now !== high) (now ? rising : falling).push(state.time)
		high = now
	}
	return { rising, falling, high }
}

test("a 555 astable: period and high time match the exact charge and discharge times (≈ 68 Hz)", () => {
	const { rising, falling } = outputEdges(astable("vcc"), 0.12, 5e-6)
	const periods = rising.slice(1).map((time, index) => time - (rising[index] ?? 0))
	const period = periods.slice(-3).reduce((sum, value) => sum + value, 0) / 3
	// Exact for this model: high = charge through R1 + R2 from ⅓ to ⅔ of 9 V; low = discharge through R2 towards
	// the discharge pin, which R1 and the 10 Ω switch hold at 9·10/1010 V (Thevenin 1000 ‖ 10 Ω).
	const floor = (9 * 10) / 1010
	const thevenin = (1000 * 10) / 1010
	const exact = 11000e-6 * Math.LN2 + (10000 + thevenin) * 1e-6 * Math.log((6 - floor) / (3 - floor))
	expect(Math.abs(period - exact) / exact).toBeLessThan(0.005)
	// The datasheet rule of thumb (a perfect discharge switch) is within 2%.
	const datasheet = Math.LN2 * (1000 + 2 * 10000) * 1e-6
	expect(Math.abs(period - datasheet) / datasheet).toBeLessThan(0.02)

	const lastRise = rising.at(-2) ?? 0
	const fallAfter = falling.find((time) => time > lastRise) ?? 0
	const high = 11000e-6 * Math.LN2
	expect(Math.abs((fallAfter - lastRise) / period - high / exact)).toBeLessThan(0.005)
})

test("a 555 with reset held low keeps its output low", () => {
	const { rising, high } = outputEdges(astable("ground"), 0.03, 5e-6)
	expect(rising).toEqual([])
	expect(high).toBe(false)
})
