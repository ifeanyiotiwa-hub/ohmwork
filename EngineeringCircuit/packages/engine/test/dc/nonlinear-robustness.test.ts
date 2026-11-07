import type { Circuit } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

const DIODE = { saturationCurrent: 1.7143528192808883e-7, emissionCoefficient: 2, seriesResistance: 0 }
const LED = { color: "red", saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 } as const
const TRANSISTOR = { beta: 100, betaReverse: 1, saturationCurrent: 1e-13 }

/** Either finite numbers everywhere, or plain-language errors: never NaN, never a throw. */
function expectSane(circuit: Circuit) {
	const result = solveDc(circuit)
	if (!result.ok) {
		expect(result.errors.every((error) => error.message.length > 0)).toBe(true)
		return result
	}
	for (const value of Object.values(result.solution.pinVoltages)) expect(Number.isFinite(value)).toBe(true)
	for (const reading of Object.values(result.solution.readings)) {
		expect(Number.isFinite(reading.voltage) && Number.isFinite(reading.current)).toBe(true)
	}
	return result
}

test("a diode straight across a battery gives a (huge) finite answer", () => {
	const result = expectSane(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "D1", type: "diode", params: DIODE },
			],
			[["V1.positive", "D1.anode"], ["D1.cathode", "V1.negative"]],
		),
	)
	expect(result.ok).toBe(true)
})

test("an LED straight across a battery is limited by its series resistance", () => {
	const result = expectSane(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "LED1", type: "led", params: LED },
			],
			[["V1.positive", "LED1.anode"], ["LED1.cathode", "V1.negative"]],
		),
	)
	expect(result.ok && (result.solution.readings.LED1?.current ?? 0)).toBeLessThan(5 / 0.042)
})

test("a transistor with its base left unconnected stays off", () => {
	const result = expectSane(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 9 } },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "Q1", type: "npn-transistor", params: TRANSISTOR },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "R1.a"], ["R1.b", "Q1.collector"], ["Q1.emitter", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		),
	)
	expect(result.ok && Math.abs(result.solution.readings.R1?.current ?? 1)).toBeLessThan(1e-6)
})

test("a MOSFET with its gate left unconnected is reported, not crashed", () => {
	expectSane(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 9 } },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "M1", type: "n-mosfet", params: { thresholdVoltage: 1.5, transconductance: 0.02 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "R1.a"], ["R1.b", "M1.drain"], ["M1.source", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		),
	)
})

test("a full-wave bridge rectifier runs over time and outputs the positive halves", () => {
	const circuit = circuitOf(
		[
			{ id: "AC1", type: "ac-source", params: { amplitude: 10, frequency: 50, offset: 0, phase: 0, delay: 0 } },
			{ id: "D1", type: "diode", params: DIODE },
			{ id: "D2", type: "diode", params: DIODE },
			{ id: "D3", type: "diode", params: DIODE },
			{ id: "D4", type: "diode", params: DIODE },
			{ id: "RL", type: "resistor", params: { resistance: 1000 } },
		],
		[
			["AC1.positive", "D1.anode"],
			["AC1.positive", "D3.cathode"],
			["AC1.negative", "D2.anode"],
			["AC1.negative", "D4.cathode"],
			["D1.cathode", "RL.a"],
			["D2.cathode", "RL.a"],
			["D3.anode", "RL.b"],
			["D4.anode", "RL.b"],
		],
	)
	let state = initialTransientState()
	let lowest = Number.POSITIVE_INFINITY
	let highest = Number.NEGATIVE_INFINITY
	for (let step = 1; step <= 4000; step++) {
		const result = stepTransient(circuit, state, { timeStep: 1e-5 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		const voltage = result.solution.readings.RL?.voltage ?? Number.NaN
		lowest = Math.min(lowest, voltage)
		highest = Math.max(highest, voltage)
	}
	expect(lowest).toBeGreaterThan(-0.01)
	expect(highest).toBeGreaterThan(8.5)
	expect(highest).toBeLessThan(10)
})
