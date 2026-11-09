// Reference values: ngspice 47, test/golden/ngspice/dc-motor.cir (the motor as its electromechanical analogue).
import { expect, test } from "vitest"
import { solveAc } from "../../src/ac/solve-ac"
import { solveDc } from "../../src/dc/solve-dc"
import { magnitude } from "../../src/linear/complex"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

const within = (actual: number | undefined, expected: number, tolerance: number) =>
	expect(Math.abs((actual ?? Number.NaN) - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(Math.abs(expected) * tolerance)

const GROUND = { id: "GND", type: "ground", params: {} } as const
const onTwelveVolts = () =>
	circuitOf(
		[{ id: "V1", type: "voltage-source", params: { voltage: 12 } }, { id: "MOT1", type: "dc-motor", params: {} }, GROUND],
		[["V1.positive", "MOT1.a"], ["MOT1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)

test("on 12 V the motor runs at its no-load speed: 813.73 rad/s (7770 rpm) drawing 13.63 mA", () => {
	const result = solveDc(onTwelveVolts())
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	within(result.solution.readings.MOT1?.speed, 8.137307e2, 1e-4)
	within(result.solution.readings.MOT1?.current, 1.362965e-2, 1e-4)
})

test("switched on from rest it spins up with its mechanical time constant (about 11 ms)", () => {
	const circuit = onTwelveVolts()
	const timeStep = 5e-6
	let state = initialTransientState()
	const speeds = new Map<number, number | undefined>()
	for (let step = 1; step <= 8000; step++) {
		const result = stepTransient(circuit, state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		if (step === 1000 || step === 2200 || step === 8000) speeds.set(step, result.solution.readings.MOT1?.speed)
	}
	within(speeds.get(1000), 2.96669e2, 2e-3)
	within(speeds.get(2200), 5.14426e2, 2e-3)
	within(speeds.get(8000), 7.92423e2, 2e-3)
})

test("its AC current per volt: back-EMF at low frequency, winding resistance, then inductance", () => {
	// 1 mΩ to measure the current by: 0.01% of the smallest impedance here.
	const sense = 1e-3
	const result = solveAc(
		circuitOf(
			[
				{ id: "AC1", type: "ac-source", params: { amplitude: 1, frequency: 1000, offset: 12, phase: 0, delay: 0 } },
				{ id: "MOT1", type: "dc-motor", params: {} },
				{ id: "RS", type: "resistor", params: { resistance: sense } },
				GROUND,
			],
			[["AC1.positive", "MOT1.a"], ["MOT1.b", "RS.a"], ["RS.b", "GND.terminal"], ["AC1.negative", "GND.terminal"]],
		),
		{ frequencies: [10, 1000, 100e3] },
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	const currents = result.points.map((point) => {
		const across = point.pinVoltages["RS:a"] ?? { re: Number.NaN, im: 0 }
		return { size: magnitude(across) / sense, phase: Math.atan2(across.im, across.re) }
	})
	const expected = [
		{ size: 6.487287e-2, phase: 0.9512294 },
		{ size: 1.130573e-1, phase: -0.130366 },
		{ size: 7.821754e-3, phase: -1.50215 },
	]
	expected.forEach((want, index) => {
		within(currents[index]?.size, want.size, 1e-3)
		expect(Math.abs((currents[index]?.phase ?? Number.NaN) - want.phase)).toBeLessThanOrEqual(1e-3)
	})
})
