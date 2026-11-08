// Reference values: ngspice 47, netlists in test/golden/ngspice/ (diode, led, npn, pnp, nmos, pmos, half-wave).
import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

type Parts = Parameters<typeof circuitOf>[0]
type Wires = Parameters<typeof circuitOf>[1]

const TOLERANCE = 0.01
const within = (actual: number | undefined, expected: number, tolerance = TOLERANCE) =>
	expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(Math.abs(expected) * tolerance)

function solved(parts: Parts, wires: Wires) {
	const result = solveDc(circuitOf(parts, wires))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution
}

const DIODE = { saturationCurrent: 1.7143528192808883e-7, emissionCoefficient: 2, seriesResistance: 0 }
const LED = { saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 }
const TRANSISTOR = { beta: 100, betaReverse: 1, saturationCurrent: 1e-13 }
const MOSFET = { thresholdVoltage: 1.5, transconductance: 0.02 }

test("a diode with 1 kΩ from 5 V drops 0.526 V (ngspice 0.5260731 V, 4.47393 mA)", () => {
	const { readings } = solved(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "D1", type: "diode", params: DIODE },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "D1.anode"], ["D1.cathode", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	within(readings.D1?.voltage, 0.5260731)
	within(readings.D1?.current, 4.47393e-3)
})

test("a red LED with 220 Ω from 5 V (ngspice 1.820098 V, 14.4541 mA)", () => {
	const { readings } = solved(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 220 } },
			{ id: "LED1", type: "led", params: { color: "red", ...LED } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "LED1.anode"], ["LED1.cathode", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	within(readings.LED1?.voltage, 1.820098)
	within(readings.LED1?.current, 14.4541e-3)
})

test("a diode the wrong way round blocks the current", () => {
	const { readings } = solved(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "D1", type: "diode", params: DIODE },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "D1.cathode"], ["D1.anode", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	expect(Math.abs(readings.D1?.current ?? 1)).toBeLessThan(1e-5)
	within(readings.D1?.voltage, -5, 0.001)
})

test("a Zener in reverse holds about its breakdown voltage (5 mA at 5.6 V by construction, as CircuitJS1)", () => {
	const zener = (supply: number) =>
		solved(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: supply } },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "DZ1", type: "zener-diode", params: { ...DIODE, breakdownVoltage: 5.6 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "R1.a"], ["R1.b", "DZ1.cathode"], ["DZ1.anode", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		).readings.DZ1
	within(zener(10.6)?.voltage, -5.6, 0.002)
	within(zener(10.6)?.current, -5e-3, 0.01)
	expect(Math.abs((zener(15)?.voltage ?? 0) + 5.6)).toBeLessThan(0.05)
	within(zener(3)?.voltage, -3, 0.001)
})

const npn = (baseResistance: number) =>
	solved(
		[
			{ id: "VCC", type: "voltage-source", params: { voltage: 10 } },
			{ id: "VBB", type: "voltage-source", params: { voltage: 2 } },
			{ id: "RC", type: "resistor", params: { resistance: 1000 } },
			{ id: "RB", type: "resistor", params: { resistance: baseResistance } },
			{ id: "Q1", type: "npn-transistor", params: TRANSISTOR },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VCC.positive", "RC.a"],
			["RC.b", "Q1.collector"],
			["VBB.positive", "RB.a"],
			["RB.b", "Q1.base"],
			["Q1.emitter", "GND.terminal"],
			["VCC.negative", "GND.terminal"],
			["VBB.negative", "GND.terminal"],
		],
	)

test("an NPN amplifies base current in its active region (ngspice Vc 8.604186 V, Vb 0.6041871 V)", () => {
	const { pinVoltages, ports } = npn(100_000)
	within(pinVoltages["Q1:collector"], 8.604186)
	within(pinVoltages["Q1:base"], 0.6041871)
	expect(ports["Q1/collector-emitter"]?.current).toBeCloseTo(1.39581e-3, 6)
})

test("an NPN driven hard saturates like a closed switch (ngspice Vc 0.1458778 V, Vb 0.6549223 V)", () => {
	const { pinVoltages } = npn(10_000)
	within(pinVoltages["Q1:collector"], 0.1458778)
	within(pinVoltages["Q1:base"], 0.6549223)
})

test("a PNP mirrors it (ngspice Vc 1.395801 V, Vb 9.395800 V)", () => {
	const { pinVoltages } = solved(
		[
			{ id: "VCC", type: "voltage-source", params: { voltage: 10 } },
			{ id: "VBB", type: "voltage-source", params: { voltage: 8 } },
			{ id: "RC", type: "resistor", params: { resistance: 1000 } },
			{ id: "RB", type: "resistor", params: { resistance: 100_000 } },
			{ id: "Q1", type: "pnp-transistor", params: TRANSISTOR },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VCC.positive", "Q1.emitter"],
			["Q1.collector", "RC.a"],
			["RC.b", "GND.terminal"],
			["VBB.positive", "RB.a"],
			["RB.b", "Q1.base"],
			["VCC.negative", "GND.terminal"],
			["VBB.negative", "GND.terminal"],
		],
	)
	within(pinVoltages["Q1:collector"], 1.395801)
	within(pinVoltages["Q1:base"], 9.3958)
})

const nmos = (gate: number) =>
	solved(
		[
			{ id: "VDD", type: "voltage-source", params: { voltage: 10 } },
			{ id: "VG", type: "voltage-source", params: { voltage: gate } },
			{ id: "RD", type: "resistor", params: { resistance: 1000 } },
			{ id: "M1", type: "n-mosfet", params: MOSFET },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VDD.positive", "RD.a"],
			["RD.b", "M1.drain"],
			["VG.positive", "M1.gate"],
			["M1.source", "GND.terminal"],
			["VDD.negative", "GND.terminal"],
			["VG.negative", "GND.terminal"],
		],
	).pinVoltages["M1:drain"]

test("an N-MOSFET follows the square law (ngspice 7.5 V saturated, 0.1437557 V linear)", () => {
	within(nmos(2), 7.5)
	within(nmos(5), 0.1437557)
	within(nmos(1), 10, 0.0001)
})

test("a P-MOSFET mirrors it (ngspice 2.5 V)", () => {
	const { pinVoltages } = solved(
		[
			{ id: "VDD", type: "voltage-source", params: { voltage: 10 } },
			{ id: "VG", type: "voltage-source", params: { voltage: 8 } },
			{ id: "RD", type: "resistor", params: { resistance: 1000 } },
			{ id: "M1", type: "p-mosfet", params: MOSFET },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VDD.positive", "M1.source"],
			["M1.drain", "RD.a"],
			["RD.b", "GND.terminal"],
			["VG.positive", "M1.gate"],
			["VDD.negative", "GND.terminal"],
			["VG.negative", "GND.terminal"],
		],
	)
	within(pinVoltages["M1:drain"], 2.5)
})

const redOnEveryColour = {
	emissionCoefficient: LED.emissionCoefficient,
	seriesResistance: LED.seriesResistance,
	redSaturationCurrent: LED.saturationCurrent,
	greenSaturationCurrent: LED.saturationCurrent,
	blueSaturationCurrent: LED.saturationCurrent,
}

test("an RGB LED lights each colour through its own pin", () => {
	const { ports } = solved(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 220 } },
			// Every colour on the red LED model, so the green pin matches the ngspice red LED golden.
			{ id: "RGB1", type: "rgb-led", params: { commonCathode: true, ...redOnEveryColour } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "RGB1.green"], ["RGB1.common", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	within(ports["RGB1/green"]?.current, 14.4541e-3)
	expect(Math.abs(ports["RGB1/red"]?.current ?? 1)).toBeLessThan(1e-9)
})

test("a half-wave rectifier charges a capacitor to the peaks (ngspice 9.40386 V top, 7.87411 V bottom)", () => {
	const circuit = circuitOf(
		[
			{ id: "AC1", type: "ac-source", params: { amplitude: 10, frequency: 50, offset: 0, phase: 0, delay: 0 } },
			{ id: "D1", type: "diode", params: DIODE },
			{ id: "C1", type: "capacitor", params: { capacitance: 100e-6 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["AC1.positive", "D1.anode"],
			["D1.cathode", "C1.a"],
			["C1.a", "R1.a"],
			["C1.b", "GND.terminal"],
			["R1.b", "GND.terminal"],
			["AC1.negative", "GND.terminal"],
		],
	)
	let state = initialTransientState()
	let top = Number.NEGATIVE_INFINITY
	let bottom = Number.POSITIVE_INFINITY
	const timeStep = 1e-5
	for (let step = 1; step <= 10_000; step++) {
		const result = stepTransient(circuit, state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		if (state.time < 0.08) continue
		const voltage = result.solution.readings.C1?.voltage ?? Number.NaN
		top = Math.max(top, voltage)
		bottom = Math.min(bottom, voltage)
	}
	within(top, 9.40386)
	within(bottom, 7.87411)
})
