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
