import { expect, test } from "vitest"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

/** 5 V through 10 Ω and a switch into 1 mH, with 1 kΩ across the inductor for its current to escape through. */
const inductorCircuit = (closed: boolean) =>
	circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "RS", type: "resistor", params: { resistance: 10, powerRating: 100 } },
			{ id: "S1", type: "switch", params: { closed } },
			{ id: "L1", type: "inductor", params: { inductance: 1e-3 } },
			{ id: "RP", type: "resistor", params: { resistance: 1000, powerRating: 1000 } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[
			["V1.positive", "RS.a"],
			["RS.b", "S1.a"],
			["S1.b", "L1.a"],
			["L1.b", "GND1.terminal"],
			["L1.a", "RP.a"],
			["RP.b", "GND1.terminal"],
			["V1.negative", "GND1.terminal"],
		],
	)

test("cutting an inductor's current off decays smoothly instead of ringing from step to step", () => {
	const timeStep = 5e-6
	let state = initialTransientState()
	for (let step = 0; step < 2000; step++) {
		const result = stepTransient(inductorCircuit(true), state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
	}
	const voltages: number[] = []
	for (let step = 0; step < 6; step++) {
		const result = stepTransient(inductorCircuit(false), state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		voltages.push(result.solution.readings.L1?.voltage ?? Number.NaN)
	}
	// L/R = 1 µs is far shorter than a 5 µs step: the voltage kick must die away without changing sign.
	expect(voltages.every((voltage) => voltage <= 1e-9)).toBe(true)
	expect(voltages.slice(1).every((voltage, index) => Math.abs(voltage) <= Math.abs(voltages[index] ?? 0) + 1e-9)).toBe(true)
})

test("after switching settles, steps return to the trapezoidal rule (RC accuracy is unchanged)", () => {
	const rc = (closed: boolean) =>
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "S1", type: "switch", params: { closed } },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
				{ id: "GND1", type: "ground", params: {} },
			],
			[["V1.positive", "S1.a"], ["S1.b", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
		)
	let state = initialTransientState()
	const timeStep = 5e-6
	for (let step = 0; step < 5; step++) {
		const result = stepTransient(rc(false), state, { timeStep })
		if (!result.ok) throw new Error("step failed")
		state = result.state
	}
	let voltage = 0
	for (let step = 0; step < 200; step++) {
		const result = stepTransient(rc(true), state, { timeStep })
		if (!result.ok) throw new Error("step failed")
		state = result.state
		voltage = result.solution.readings.C1?.voltage ?? Number.NaN
	}
	// One time constant after closing: 5 (1 − e⁻¹) = 3.1606 V, within 0.1% despite the settling steps.
	expect(Math.abs(voltage - 3.1606) / 3.1606).toBeLessThan(0.001)
})

/** Steps a circuit that changes after `first` steps; returns how many settling steps were left after the change. */
function settlingAfterChange(
	before: Parameters<typeof stepTransient>[0],
	after: Parameters<typeof stepTransient>[0],
	options: { pressedAfter?: ReadonlySet<string> } = {},
): number | undefined {
	let state = initialTransientState()
	for (let step = 0; step < 3; step++) {
		const result = stepTransient(before, state, { timeStep: 5e-6 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
	}
	const changed = stepTransient(after, state, { timeStep: 5e-6, ...(options.pressedAfter ? { pressed: options.pressedAfter } : {}) })
	if (!changed.ok) throw new Error(JSON.stringify(changed.errors))
	return changed.state.settling
}

const lampBehind = (part: Parameters<typeof circuitOf>[0][number], wires: Parameters<typeof circuitOf>[1]) =>
	circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			part,
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[...wires, ["R1.b", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
	)

test("pressing a push button starts the settling steps", () => {
	const circuit = lampBehind({ id: "PB1", type: "push-button", params: { normallyOpen: true } }, [["V1.positive", "PB1.a"], ["PB1.b", "R1.a"]])
	expect(settlingAfterChange(circuit, circuit)).toBe(0)
	expect(settlingAfterChange(circuit, circuit, { pressedAfter: new Set(["PB1"]) })).toBe(10)
})

test("flipping a two-way switch starts the settling steps", () => {
	const spdt = (position: "a" | "b") =>
		lampBehind({ id: "S1", type: "switch-spdt", params: { position } }, [["V1.positive", "S1.common"], ["S1.a", "R1.a"]])
	expect(settlingAfterChange(spdt("a"), spdt("b"))).toBe(10)
})

test("a logic output changing starts the settling steps, on the step the output changes (one step after its input, ADR-018)", () => {
	const inverter = (high: boolean) =>
		circuitOf(
			[
				{ id: "IN1", type: "logic-input", params: { high } },
				{ id: "N1", type: "not-gate", params: {} },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "GND1", type: "ground", params: {} },
			],
			[["IN1.out", "N1.in"], ["N1.out", "R1.a"], ["R1.b", "GND1.terminal"]],
		)
	// The input flips at step 4; the gate's output follows at step 5, and ten settling steps start there.
	expect(settlingSequence(inverter(false), inverter(true))).toEqual([0, 0, 0, 0, 10, 9])
})

/** Settling steps left after each of six steps; the circuit changes from `before` to `after` at the fourth. */
function settlingSequence(before: Parameters<typeof stepTransient>[0], after: Parameters<typeof stepTransient>[0]) {
	let state = initialTransientState()
	const seen: (number | undefined)[] = []
	for (let step = 0; step < 6; step++) {
		const result = stepTransient(step < 3 ? before : after, state, { timeStep: 5e-6 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		seen.push(state.settling)
	}
	return seen
}
