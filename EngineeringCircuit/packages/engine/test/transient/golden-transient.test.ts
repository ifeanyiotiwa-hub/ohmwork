// Reference values: ngspice 47, netlists in test/golden/ngspice/ (rc-charging, rl-rise, rlc-ringing, rc-lowpass-ac).
import type { Circuit } from "@ohmwork/format"
import { expect, test } from "vitest"
import type { DcSolution } from "../../src/dc/solve-dc"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

/** The deliverable's bar: within 1% of the reference. */
const TOLERANCE = 0.01
/** RC charging is documented as within 0.003% of ngspice (DELIVERABLES D3a); held to that. */
const RC_TOLERANCE = 3e-5

function run(circuit: Circuit, timeStep: number, until: number, onStep?: (time: number, solution: DcSolution) => void) {
	let state = initialTransientState()
	let last: DcSolution | undefined
	const steps = Math.round(until / timeStep)
	for (let step = 0; step < steps; step++) {
		const result = stepTransient(circuit, state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		last = result.solution
		onStep?.(state.time, result.solution)
	}
	if (!last) throw new Error("no steps run")
	return last
}

const within = (actual: number | undefined, expected: number, tolerance = TOLERANCE) =>
	expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(Math.abs(expected) * tolerance)

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

test("RC charging follows 5(1 − e^(−t/τ)) (ngspice: 3.16060, 4.32332, 4.96631 V)", () => {
	const timeStep = 1e-5
	within(run(rc(), timeStep, 1e-3).readings.C1?.voltage, 3.1606, RC_TOLERANCE)
	within(run(rc(), timeStep, 2e-3).readings.C1?.voltage, 4.32332, RC_TOLERANCE)
	within(run(rc(), timeStep, 5e-3).readings.C1?.voltage, 4.96631, RC_TOLERANCE)
})

test("the charging current is the resistor's current, flowing into the capacitor", () => {
	const solution = run(rc(), 1e-5, 1e-3)
	within(solution.readings.C1?.current, (5 - 3.1606) / 1000)
	within(solution.readings.R1?.current, (5 - 3.1606) / 1000)
})

test("RL current rises as 0.5(1 − e^(−t/τ)) A (ngspice: 0.316060, 0.432332 A)", () => {
	const rl = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 10 } },
			{ id: "L1", type: "inductor", params: { inductance: 0.01 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "L1.a"], ["L1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	within(run(rl, 1e-5, 1e-3).readings.L1?.current, 0.31606)
	within(run(rl, 1e-5, 2e-3).readings.L1?.current, 0.432332)
})

test("a series RLC rings like ngspice says (4.97235, 9.75669, 0.476638 V)", () => {
	const rlc = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 1 } },
			{ id: "L1", type: "inductor", params: { inductance: 1e-3 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["V1.positive", "R1.a"],
			["R1.b", "L1.a"],
			["L1.b", "C1.a"],
			["C1.b", "GND.terminal"],
			["V1.negative", "GND.terminal"],
		],
	)
	const timeStep = 1e-7
	within(run(rlc, timeStep, 50e-6).readings.C1?.voltage, 4.97235)
	within(run(rlc, timeStep, 100e-6).readings.C1?.voltage, 9.75669)
	within(run(rlc, timeStep, 200e-6).readings.C1?.voltage, 0.476638)
})

test("an RC low-pass passes 1/√2 of a sine at its corner frequency (ngspice: 0.707107 V)", () => {
	const lowPass = circuitOf(
		[
			{ id: "AC1", type: "ac-source", params: { amplitude: 1, frequency: 159.155, offset: 0, phase: 0, delay: 0 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["AC1.positive", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "GND.terminal"], ["AC1.negative", "GND.terminal"]],
	)
	let peak = 0
	run(lowPass, 1e-5, 60e-3, (time, solution) => {
		if (time >= 50e-3) peak = Math.max(peak, solution.readings.C1?.voltage ?? 0)
	})
	within(peak, 0.707107)
})
