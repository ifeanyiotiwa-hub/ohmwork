import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

type Parts = Parameters<typeof circuitOf>[0]
type Wires = Parameters<typeof circuitOf>[1]
const HIGH = 5

function voltages(parts: Parts, wires: Wires) {
	const result = solveDc(circuitOf(parts, wires))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution.pinVoltages
}
const input = (id: string, high: boolean) => ({ id, type: "logic-input", params: { high } }) as const
const BITS = ["d0", "d1", "d2", "d3"] as const

// CircuitJS1 SevenSegDecoderElm segments a–g for 0–F.
const SEGMENTS = [
	"1111110", "0110000", "1101101", "1111001", "0110011", "1011011", "1011111", "1110000",
	"1111111", "1111011", "1110111", "0011111", "1001110", "0111101", "1001111", "1000111",
]

test("the BCD decoder lights the right segments for every code", () => {
	for (let code = 0; code < 16; code++) {
		const pins = voltages(
			[...BITS.map((bit, index) => input(`IN${index}`, ((code >> index) & 1) === 1)), { id: "DEC1", type: "bcd-to-seven-segment", params: {} }],
			BITS.map((bit, index): Wires[number] => [`IN${index}.out`, `DEC1.${bit}`]),
		)
		const lit = ["a", "b", "c", "d", "e", "f", "g"].map((segment) => ((pins[`DEC1:${segment}`] ?? 0) > HIGH / 2 ? "1" : "0")).join("")
		expect(lit, `code ${code}`).toBe(SEGMENTS[code])
	}
})

const adcOf = (input: number) => {
	const pins = voltages(
		[
			{ id: "VIN", type: "voltage-source", params: { voltage: input } },
			{ id: "VREF", type: "voltage-rail", params: { voltage: 5 } },
			{ id: "ADC1", type: "adc-4bit", params: {} },
			{ id: "GND", type: "ground", params: {} },
		],
		[["VIN.positive", "ADC1.in"], ["VIN.negative", "GND.terminal"], ["VREF.terminal", "ADC1.vref"]],
	)
	return BITS.reduce((code, bit, index) => code + ((pins[`ADC1:${bit}`] ?? 0) > HIGH / 2 ? 1 << index : 0), 0)
}

test("the ADC truncates 15 × Vin / Vref, as CircuitJS1 (no rounding)", () => {
	expect(adcOf(0)).toBe(0)
	expect(adcOf(2.6)).toBe(7)
	expect(adcOf(3.33)).toBe(9)
	expect(adcOf(5)).toBe(15)
	expect(adcOf(7)).toBe(15)
})

test("the DAC outputs code × Vref / 15", () => {
	const pins = voltages(
		[
			input("B0", false),
			input("B1", true),
			input("B2", false),
			input("B3", true),
			{ id: "VREF", type: "voltage-rail", params: { voltage: 5 } },
			{ id: "DAC1", type: "dac-4bit", params: {} },
		],
		[["B0.out", "DAC1.d0"], ["B1.out", "DAC1.d1"], ["B2.out", "DAC1.d2"], ["B3.out", "DAC1.d3"], ["VREF.terminal", "DAC1.vref"]],
	)
	expect(pins["DAC1:out"]).toBeCloseTo((10 * 5) / 15, 9)
})

test("an ADC feeding a DAC returns the input, quantised down to the step below", () => {
	const pins = voltages(
		[
			{ id: "VIN", type: "voltage-source", params: { voltage: 2.6 } },
			{ id: "VREF", type: "voltage-rail", params: { voltage: 5 } },
			{ id: "ADC1", type: "adc-4bit", params: {} },
			{ id: "DAC1", type: "dac-4bit", params: {} },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VIN.positive", "ADC1.in"],
			["VIN.negative", "GND.terminal"],
			["VREF.terminal", "ADC1.vref"],
			["VREF.terminal", "DAC1.vref"],
			...BITS.map((bit): Wires[number] => [`ADC1.${bit}`, `DAC1.${bit}`]),
		],
	)
	expect(pins["DAC1:out"]).toBeCloseTo((7 * 5) / 15, 9)
})

const RELAY = { coilInductance: 0.2, coilResistance: 20, onCurrent: 0.02, offCurrent: 0.015 }
const relayCircuit = (coilVolts: number) =>
	circuitOf(
		[
			{ id: "VC", type: "voltage-source", params: { voltage: coilVolts } },
			{ id: "VL", type: "voltage-source", params: { voltage: 9 } },
			{ id: "RLY1", type: "relay", params: RELAY },
			{ id: "RNO", type: "resistor", params: { resistance: 100 } },
			{ id: "RNC", type: "resistor", params: { resistance: 100 } },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VC.positive", "RLY1.coilA"],
			["RLY1.coilB", "GND.terminal"],
			["VC.negative", "GND.terminal"],
			["VL.positive", "RLY1.common"],
			["RLY1.normallyOpen", "RNO.a"],
			["RLY1.normallyClosed", "RNC.a"],
			["RNO.b", "GND.terminal"],
			["RNC.b", "GND.terminal"],
			["VL.negative", "GND.terminal"],
		],
	)

test("a relay with 250 mA in its coil pulls in; with 15 mA it stays on its normally-closed side", () => {
	const on = solveDc(relayCircuit(5))
	expect(on.ok && on.solution.readings.RNO?.current).toBeCloseTo(0.09, 9)
	expect(on.ok && on.solution.readings.RNC?.current).toBeCloseTo(0, 9)
	const off = solveDc(relayCircuit(0.3))
	expect(off.ok && off.solution.readings.RNC?.current).toBeCloseTo(0.09, 9)
})

test("over time the coil current rises with τ = L/R = 10 ms, and the relay pulls in when it passes 20 mA", () => {
	let state = initialTransientState()
	let pulledIn: number | undefined
	const timeStep = 5e-6
	for (let step = 1; step <= 1000; step++) {
		const result = stepTransient(relayCircuit(5), state, { timeStep })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		if (pulledIn === undefined && (result.solution.readings.RNO?.current ?? 0) > 0.05) pulledIn = state.time
	}
	// i(t) = 0.25 (1 − e^(−t/τ)) reaches 20 mA at t = −τ ln(1 − 0.08) ≈ 0.834 ms (plus one step to act).
	const expected = -0.01 * Math.log(1 - 0.02 / 0.25)
	expect(pulledIn).toBeDefined()
	expect(Math.abs((pulledIn ?? 0) - expected)).toBeLessThan(3 * timeStep)
})

test("between 15 and 20 mA the relay keeps whatever side it was on (hysteresis)", () => {
	const holding = relayCircuit(0.35)
	// 17.5 mA: from rest it stays off…
	let state = initialTransientState()
	for (let step = 0; step < 200; step++) {
		const result = stepTransient(holding, state, { timeStep: 1e-3 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
	}
	const fromRest = stepTransient(holding, state, { timeStep: 1e-3 })
	expect(fromRest.ok && fromRest.solution.readings.RNC?.current).toBeCloseTo(0.09, 6)
	// …but once pulled in at 250 mA, dropping to 17.5 mA keeps it in.
	for (let step = 0; step < 200; step++) {
		const result = stepTransient(relayCircuit(5), state, { timeStep: 1e-3 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
	}
	for (let step = 0; step < 200; step++) {
		const result = stepTransient(holding, state, { timeStep: 1e-3 })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
	}
	const held = stepTransient(holding, state, { timeStep: 1e-3 })
	expect(held.ok && held.solution.readings.RNO?.current).toBeCloseTo(0.09, 6)
})

test("below 15 mA a pulled-in relay drops out again, once its coil current has fallen", () => {
	let state = initialTransientState()
	const run = (circuit: ReturnType<typeof relayCircuit>, steps: number) => {
		let last: ReturnType<typeof stepTransient> | undefined
		for (let step = 0; step < steps; step++) {
			last = stepTransient(circuit, state, { timeStep: 1e-3 })
			if (!last.ok) throw new Error(JSON.stringify(last.errors))
			state = last.state
		}
		return last?.ok ? last.solution : undefined
	}
	expect(run(relayCircuit(5), 200)?.readings.RNO?.current).toBeCloseTo(0.09, 6)
	// 0.2 V on the 20 Ω coil: 10 mA, below the 15 mA drop-out current, after a few τ = 10 ms.
	expect(run(relayCircuit(0.2), 200)?.readings.RNC?.current).toBeCloseTo(0.09, 6)
})

test("unconnected inputs that only read (display segments, ADC and DAC pins, probes) raise no ground warning", () => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "DISP1", type: "seven-segment", params: {} },
				{ id: "ADC1", type: "adc-4bit", params: {} },
				{ id: "DAC1", type: "dac-4bit", params: {} },
				{ id: "P1", type: "scope-probe", params: {} },
			],
			[],
		),
	)
	expect(result.ok && result.solution.warnings).toEqual([])
})

test("an unconnected op-amp input still warns: it is a classic mistake", () => {
	const result = solveDc(circuitOf([{ id: "U1", type: "op-amp", params: { gain: 100000, supplyHigh: 15, supplyLow: -15 } }], []))
	expect(result.ok && result.solution.warnings.length).toBeGreaterThan(0)
})

const BITS_8 = ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"] as const

const adc8Of = (volts: number) => {
	const pins = voltages(
		[
			{ id: "VIN", type: "voltage-source", params: { voltage: volts } },
			{ id: "VREF", type: "voltage-rail", params: { voltage: 5 } },
			{ id: "ADC1", type: "adc-8bit", params: {} },
			{ id: "GND", type: "ground", params: {} },
		],
		[["VIN.positive", "ADC1.in"], ["VIN.negative", "GND.terminal"], ["VREF.terminal", "ADC1.vref"]],
	)
	return BITS_8.reduce((code, bit, index) => code + ((pins[`ADC1:${bit}`] ?? 0) > HIGH / 2 ? 1 << index : 0), 0)
}

test("the 8-bit ADC truncates 255 × Vin / Vref (steps of 19.6 mV at 5 V)", () => {
	expect(adc8Of(0)).toBe(0)
	expect(adc8Of(2.6)).toBe(132)
	expect(adc8Of(0.0195)).toBe(0)
	expect(adc8Of(0.0197)).toBe(1)
	expect(adc8Of(5)).toBe(255)
	expect(adc8Of(9)).toBe(255)
})

test("the 8-bit DAC outputs code × Vref / 255, and an 8-bit ADC → DAC round trip lands within one step below", () => {
	const code = 0b10110101
	const out = voltages(
		[
			...BITS_8.map((_bit, index) => input(`B${index}`, ((code >> index) & 1) === 1)),
			{ id: "VREF", type: "voltage-rail", params: { voltage: 5 } },
			{ id: "DAC1", type: "dac-8bit", params: {} },
		],
		[...BITS_8.map((bit, index): Wires[number] => [`B${index}.out`, `DAC1.${bit}`]), ["VREF.terminal", "DAC1.vref"]],
	)["DAC1:out"]
	expect(out).toBeCloseTo((code * 5) / 255, 9)

	const roundTrip = voltages(
		[
			{ id: "VIN", type: "voltage-source", params: { voltage: 2.6 } },
			{ id: "VREF", type: "voltage-rail", params: { voltage: 5 } },
			{ id: "ADC1", type: "adc-8bit", params: {} },
			{ id: "DAC1", type: "dac-8bit", params: {} },
			{ id: "GND", type: "ground", params: {} },
		],
		[
			["VIN.positive", "ADC1.in"],
			["VIN.negative", "GND.terminal"],
			["VREF.terminal", "ADC1.vref"],
			["VREF.terminal", "DAC1.vref"],
			...BITS_8.map((bit): Wires[number] => [`ADC1.${bit}`, `DAC1.${bit}`]),
		],
	)["DAC1:out"]
	// One step behind (ADR-018): a DC solve settles the logic first, so the result is 132 × 5 / 255.
	expect(roundTrip).toBeCloseTo((132 * 5) / 255, 9)
})

test("an ADC → DAC round trip over a bus: two 8-bit bus connectors named D carry all eight bits without a wire between", () => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "VIN", type: "voltage-source", params: { voltage: 2.6 } },
				{ id: "VREF", type: "voltage-rail", params: { voltage: 5 } },
				{ id: "ADC1", type: "adc-8bit", params: {} },
				{ id: "BUSO1", type: "bus-8", params: { name: "D" } },
				{ id: "BUSO2", type: "bus-8", params: { name: "D" } },
				{ id: "DAC1", type: "dac-8bit", params: {} },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["VIN.positive", "ADC1.in"],
				["VIN.negative", "GND.terminal"],
				["VREF.terminal", "ADC1.vref"],
				["VREF.terminal", "DAC1.vref"],
				...BITS_8.map((bit): Wires[number] => [`ADC1.${bit}`, `BUSO1.${bit}`]),
				...BITS_8.map((bit): Wires[number] => [`BUSO2.${bit}`, `DAC1.${bit}`]),
			],
		),
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expect(result.solution.pinVoltages["DAC1:out"]).toBeCloseTo((132 * 5) / 255, 9)
	expect(result.solution.warnings).toEqual([])
})

test("a 4-bit bus with nothing on some members raises no warning", () => {
	const result = solveDc(
		circuitOf(
			[input("B0", true), { id: "BUSQ1", type: "bus-4", params: { name: "Q" } }, { id: "NL1", type: "net-label", params: { name: "q0" } }, { id: "OUT1", type: "logic-output", params: {} }],
			[["B0.out", "BUSQ1.d0"], ["NL1.terminal", "OUT1.in"]],
		),
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expect(result.solution.pinVoltages["OUT1:in"]).toBeCloseTo(5, 9)
	expect(result.solution.warnings).toEqual([])
})
