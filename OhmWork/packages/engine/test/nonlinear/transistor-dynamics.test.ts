// Reference values: ngspice 47, netlists in test/golden/ngspice/ (npn-early, npn-storage, diode-temperature).
import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

const BJT = { beta: 100, betaReverse: 1, saturationCurrent: 1e-13 }
const NO_CHARGE = { emitterCapacitance: 0, collectorCapacitance: 0, transitTime: 0, reverseTransitTime: 0 }

test("Early effect: with VAF 50 V the collector current grows with collector voltage (ngspice: 1.02809 mA at 2 V, 1.18809 mA at 10 V)", () => {
	const collectorCurrent = (volts: number) => {
		const result = solveDc(
			circuitOf(
				[
					{ id: "IB", type: "current-source", params: { current: 10e-6 } },
					{ id: "VC", type: "voltage-source", params: { voltage: volts } },
					{ id: "Q1", type: "npn-transistor", params: { ...BJT, ...NO_CHARGE, earlyVoltage: 50 } },
					{ id: "GND", type: "ground", params: {} },
				],
				[["IB.positive", "Q1.base"], ["IB.negative", "GND.terminal"], ["VC.positive", "Q1.collector"], ["VC.negative", "GND.terminal"], ["Q1.emitter", "GND.terminal"]],
			),
		)
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		return Math.abs(result.solution.ports["Q1/collector-emitter"]?.current ?? 0)
	}
	expect(Math.abs(collectorCurrent(2) - 1.02809e-3)).toBeLessThan(1.02809e-3 * 0.005)
	expect(Math.abs(collectorCurrent(10) - 1.18809e-3)).toBeLessThan(1.18809e-3 * 0.005)
})

test("stored charge: a saturated transistor switch turns off late (ngspice: the collector reaches 2.5 V 205 ns after the base drive falls)", () => {
	const circuit = circuitOf(
		[
			{ id: "VIN", type: "square-source", params: { low: 0, high: 5, frequency: 50e3, dutyCycle: 0.5 } },
			{ id: "RB", type: "resistor", params: { resistance: 10e3 } },
			{ id: "VCC", type: "voltage-source", params: { voltage: 5 } },
			{ id: "RC", type: "resistor", params: { resistance: 1e3 } },
			{ id: "Q1", type: "npn-transistor", params: { ...BJT, earlyVoltage: 1e15 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VIN.positive", "RB.a"],
			["RB.b", "Q1.base"],
			["VIN.negative", "GND.terminal"],
			["VCC.positive", "RC.a"],
			["RC.b", "Q1.collector"],
			["VCC.negative", "GND.terminal"],
			["Q1.emitter", "GND.terminal"],
		],
	)
	const timeStep = 1e-9
	let state = initialTransientState()
	let previous = { time: 0, collector: 0 }
	let crossing: number | undefined
	for (let step = 1; step <= Math.round(10.6e-6 / timeStep); step++) {
		const result = stepTransient(circuit, state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		const collector = result.solution.pinVoltages["Q1:collector"] ?? 0
		if (crossing === undefined && state.time > 10e-6 && previous.collector < 2.5 && collector >= 2.5) {
			crossing = previous.time + ((2.5 - previous.collector) / (collector - previous.collector)) * (state.time - previous.time)
		}
		previous = { time: state.time, collector }
	}
	expect(crossing).toBeDefined()
	const delay = (crossing ?? 0) - 10e-6
	expect(Math.abs(delay - 205.2e-9)).toBeLessThan(205.2e-9 * 0.03)
})

test("temperature: a silicon diode at 1 mA drops 0.655 V at 27 °C and 0.569 V at 75 °C (ngspice, EG 1.11, XTI 3)", () => {
	const dropAt = (temperature: number) => {
		const circuit = circuitOf(
			[
				{ id: "I1", type: "current-source", params: { current: 1e-3 } },
				{ id: "D1", type: "diode", params: { saturationCurrent: 1e-14, emissionCoefficient: 1, seriesResistance: 0 } },
			],
			[["I1.positive", "D1.anode"], ["D1.cathode", "I1.negative"]],
		)
		const result = solveDc({ ...circuit, simulation: { ...circuit.simulation, temperature } })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		return result.solution.readings.D1?.voltage ?? 0
	}
	expect(Math.abs(dropAt(27) - 0.655118)).toBeLessThan(0.655118 * 0.002)
	expect(Math.abs(dropAt(75) - 0.5690216)).toBeLessThan(0.5690216 * 0.002)
})

test("gate capacitance: with drain and source at ground, the gate charges through 10 kΩ with τ = R·(Cgs + Cgd) = 620 ns", () => {
	const circuit = circuitOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "RG", type: "resistor", params: { resistance: 10e3 } },
			{ id: "M1", type: "n-mosfet", params: { gateSourceCapacitance: 16e-12, gateDrainCapacitance: 46e-12 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "RG.a"], ["RG.b", "M1.gate"], ["V1.negative", "GND.terminal"], ["M1.drain", "GND.terminal"], ["M1.source", "GND.terminal"]],
	)
	let state = initialTransientState()
	let gate = 0
	for (let step = 1; step <= 620; step++) {
		const result = stepTransient(circuit, state, { timeStep: 1e-9 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		gate = result.solution.pinVoltages["M1:gate"] ?? 0
	}
	expect(Math.abs(gate - 5 * (1 - Math.exp(-1)))).toBeLessThan(5 * (1 - Math.exp(-1)) * 0.01)
})
