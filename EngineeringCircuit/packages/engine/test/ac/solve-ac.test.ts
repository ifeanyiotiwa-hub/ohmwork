// Reference values: ngspice 47, netlists test/golden/ngspice/ac-*.cir (gain in dB and phase in radians of v(out)).
import { expect, test } from "vitest"
import { gainAndPhase, solveAc, sweepFrequencies } from "../../src/ac/solve-ac"
import { complex } from "../../src/linear/complex"
import { circuitOf } from "../support/circuit-of"

type Parts = Parameters<typeof circuitOf>[0]
type Wires = Parameters<typeof circuitOf>[1]
type Expected = { frequency: number; decibels: number; phase: number }

/** Gains to 0.01 dB, phases to 0.001 rad. */
const DECIBELS = 0.01
const RADIANS = 1e-3
const INPUT = { amplitude: 1, frequency: 1000, offset: 0, phase: 0, delay: 0 }
const GROUND = { id: "GND", type: "ground", params: {} } as const

function expectResponse(parts: Parts, wires: Wires, output: string, expected: Expected[]) {
	const result = solveAc(circuitOf(parts, wires), { frequencies: expected.map((point) => point.frequency) })
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	result.points.forEach((point, index) => {
		const want = expected[index]
		const { decibels, phase } = gainAndPhase(point.pinVoltages[output] ?? complex(Number.NaN), complex(1))
		expect(Math.abs(decibels - (want?.decibels ?? Number.NaN)), `${point.frequency} Hz gain ${decibels}`).toBeLessThanOrEqual(DECIBELS)
		expect(Math.abs(phase - (want?.phase ?? Number.NaN)), `${point.frequency} Hz phase ${phase}`).toBeLessThanOrEqual(RADIANS)
	})
}

test("an RC low-pass is 3 dB down and 45° behind at its corner", () => {
	expectResponse(
		[
			{ id: "AC1", type: "ac-source", params: INPUT },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			GROUND,
		],
		[["AC1.positive", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "GND.terminal"], ["AC1.negative", "GND.terminal"]],
		"C1:a",
		[
			{ frequency: 10, decibels: -1.71115e-2, phase: -6.27494e-2 },
			{ frequency: 159.155, decibels: -3.0103, phase: -0.785398 },
			{ frequency: 10e3, decibels: -35.9647, phase: -1.55488 },
		],
	)
})

test("a series RLC passes everything at resonance and little either side", () => {
	expectResponse(
		[
			{ id: "AC1", type: "ac-source", params: INPUT },
			{ id: "L1", type: "inductor", params: { inductance: 10e-3 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "R1", type: "resistor", params: { resistance: 10 } },
			GROUND,
		],
		[["AC1.positive", "L1.a"], ["L1.b", "C1.a"], ["C1.b", "R1.a"], ["R1.b", "GND.terminal"], ["AC1.negative", "GND.terminal"]],
		"R1:a",
		[
			{ frequency: 1591.55, decibels: 0, phase: 0 },
			{ frequency: 1000, decibels: -19.7212, phase: 1.46735 },
			{ frequency: 3000, decibels: -22.6588, phase: -1.4971 },
		],
	)
})

test("a ×10 amplifier rolls off at its gain-bandwidth over 10", () => {
	expectResponse(
		[
			{ id: "AC1", type: "ac-source", params: INPUT },
			{ id: "U1", type: "op-amp", params: { gain: 100000, gainBandwidth: 1.16666666667e6 } },
			{ id: "RF", type: "resistor", params: { resistance: 9000 } },
			{ id: "RG", type: "resistor", params: { resistance: 1000 } },
			GROUND,
		],
		[
			["AC1.positive", "U1.nonInverting"],
			["U1.output", "RF.a"],
			["RF.b", "U1.inverting"],
			["U1.inverting", "RG.a"],
			["RG.b", "GND.terminal"],
			["AC1.negative", "GND.terminal"],
		],
		"U1:output",
		[
			{ frequency: 1000, decibels: 19.99881, phase: -8.57036e-3 },
			{ frequency: 116.667e3, decibels: 16.98925, phase: -0.78535 },
			{ frequency: 1e6, decibels: 1.280211, phase: -1.45464 },
		],
	)
})

test("a common-emitter amplifier: coupling capacitors below, flat mid-band, its charge above", () => {
	expectResponse(
		[
			{ id: "AC1", type: "ac-source", params: INPUT },
			{ id: "VCC", type: "voltage-source", params: { voltage: 12 } },
			{ id: "CIN", type: "capacitor", params: { capacitance: 10e-6 } },
			{ id: "R1", type: "resistor", params: { resistance: 47e3 } },
			{ id: "R2", type: "resistor", params: { resistance: 10e3 } },
			{
				id: "Q1",
				type: "npn-transistor",
				params: {
					beta: 100,
					betaReverse: 1,
					saturationCurrent: 1e-13,
					earlyVoltage: 1000,
					emitterCapacitance: 4.64214e-12,
					collectorCapacitance: 3.76961e-12,
					transitTime: 0.419578e-9,
					reverseTransitTime: 68.2023e-9,
				},
			},
			{ id: "RC", type: "resistor", params: { resistance: 4.7e3 } },
			{ id: "RE", type: "resistor", params: { resistance: 1e3 } },
			{ id: "CE", type: "capacitor", params: { capacitance: 100e-6 } },
			{ id: "COUT", type: "capacitor", params: { capacitance: 10e-6 } },
			{ id: "RL", type: "resistor", params: { resistance: 100e3 } },
			GROUND,
		],
		[
			["AC1.negative", "GND.terminal"],
			["VCC.negative", "GND.terminal"],
			["AC1.positive", "CIN.a"],
			["CIN.b", "Q1.base"],
			["VCC.positive", "R1.a"],
			["R1.b", "Q1.base"],
			["Q1.base", "R2.a"],
			["R2.b", "GND.terminal"],
			["VCC.positive", "RC.a"],
			["RC.b", "Q1.collector"],
			["Q1.emitter", "RE.a"],
			["RE.b", "GND.terminal"],
			["Q1.emitter", "CE.a"],
			["CE.b", "GND.terminal"],
			["Q1.collector", "COUT.a"],
			["COUT.b", "RL.a"],
			["RL.b", "GND.terminal"],
		],
		"RL:a",
		[
			{ frequency: 10, decibels: 27.85399, phase: -1.63055 },
			{ frequency: 1000, decibels: 47.46559, phase: -3.0465 },
			{ frequency: 10e6, decibels: 44.24859, phase: 2.324221 },
		],
	)
})

test("a sweep runs from start to stop with the points per decade asked", () => {
	const frequencies = sweepFrequencies({ start: 10, stop: 1e5, pointsPerDecade: 10 })
	expect(frequencies).toHaveLength(41)
	expect(frequencies[0]).toBe(10)
	expect(frequencies.at(-1)).toBeCloseTo(1e5, 6)
	expect(frequencies[10]).toBeCloseTo(100, 9)
	expect(sweepFrequencies({ start: 50, stop: 50, pointsPerDecade: 10 })).toEqual([50])
})

test("without an AC source there is nothing to respond to", () => {
	const result = solveAc(
		circuitOf(
			[{ id: "V1", type: "voltage-source", params: { voltage: 5 } }, { id: "R1", type: "resistor", params: { resistance: 1000 } }, GROUND],
			[["V1.positive", "R1.a"], ["R1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		),
		{ start: 10, stop: 1000, pointsPerDecade: 5 },
	)
	expect(result.ok).toBe(false)
})

test("a 1:2 transformer with tight coupling doubles the voltage into a load", () => {
	// 0.1 Ω of source resistance: a source straight across a winding is a short at DC, as in SPICE.
	const result = solveAc(
		circuitOf(
			[
				{ id: "AC1", type: "ac-source", params: INPUT },
				{ id: "RS", type: "resistor", params: { resistance: 0.1 } },
				{ id: "T1", type: "transformer", params: { primaryInductance: 1, turnsRatio: 2, coupling: 0.9999 } },
				{ id: "RL", type: "resistor", params: { resistance: 1000 } },
				GROUND,
			],
			[
				["AC1.positive", "RS.a"],
				["RS.b", "T1.primaryA"],
				["AC1.negative", "GND.terminal"],
				["T1.primaryB", "GND.terminal"],
				["T1.secondaryA", "RL.a"],
				["T1.secondaryB", "GND.terminal"],
				["RL.b", "GND.terminal"],
			],
		),
		{ frequencies: [1000] },
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	const { decibels } = gainAndPhase(result.points[0]?.pinVoltages["RL:a"] ?? complex(Number.NaN), complex(1))
	expect(decibels).toBeCloseTo(20 * Math.log10(2), 1)
})
