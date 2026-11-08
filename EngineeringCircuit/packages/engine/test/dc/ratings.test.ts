import { LED_MODELS } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { circuitOf } from "../support/circuit-of"

const warningsOf = (parts: Parameters<typeof circuitOf>[0], wires: Parameters<typeof circuitOf>[1]) => {
	const result = solveDc(circuitOf(parts, wires))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution.warnings.map((warning) => warning.message)
}

test.each([
	["red", 1.85],
	["yellow", 2.1],
	["green", 2.2],
	["blue", 3.3],
	["white", 3.3],
] as const)("a %s LED drops its datasheet voltage (%s V) at 20 mA", (color, volts) => {
	// A 20 mA current source straight into the LED.
	const result = solveDc(
		circuitOf(
			[
				{ id: "I1", type: "current-source", params: { current: 0.02 } },
				{ id: "LED1", type: "led", params: { color, ...LED_MODELS[color] } },
			],
			[["I1.positive", "LED1.anode"], ["LED1.cathode", "I1.negative"]],
		),
	)
	expect(result.ok && result.solution.readings.LED1?.voltage).toBeCloseTo(volts, 2)
})

test("an LED with no resistor is reported as burning out, with the current and its rating", () => {
	expect(
		warningsOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "LED1", type: "led", params: { color: "red" } },
				{ id: "GND1", type: "ground", params: {} },
			],
			[["V1.positive", "LED1.anode"], ["LED1.cathode", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
		),
	).toContainEqual(expect.stringMatching(/^LED1 carries \d+(\.\d+)? A, but it is rated for 30 mA: a real one would burn out\./))
})

test("a resistor turning more than its power rating into heat is reported", () => {
	const warnings = warningsOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 10 } },
			{ id: "R1", type: "resistor", params: { resistance: 100 } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
	)
	expect(warnings).toContain(
		"R1 turns 1 W into heat, but it is rated for 250 mW: a real one would burn out. Use a larger resistance or a higher power rating.",
	)
})

test("a diode over its current rating, and a lamp well over its rated voltage, are reported", () => {
	const warnings = warningsOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 12 } },
			{ id: "R1", type: "resistor", params: { resistance: 1, powerRating: 1000 } },
			{ id: "D1", type: "diode", params: {} },
			{ id: "LMP1", type: "lamp", params: { ratedVoltage: 6, ratedPower: 1 } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[
			["V1.positive", "R1.a"],
			["R1.b", "D1.anode"],
			["D1.cathode", "GND1.terminal"],
			["V1.positive", "LMP1.a"],
			["LMP1.b", "GND1.terminal"],
			["V1.negative", "GND1.terminal"],
		],
	)
	expect(warnings).toContainEqual(expect.stringMatching(/^D1 carries \d+(\.\d+)? A, but it is rated for 1 A: a real one would burn out\./))
	expect(warnings).toContain("LMP1 has 12 V across it, but it is rated for 6 V: a real one would burn out.")
})

test("parts within their ratings raise nothing", () => {
	expect(
		warningsOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "R1", type: "resistor", params: { resistance: 220 } },
				{ id: "LED1", type: "led", params: { color: "red" } },
				{ id: "GND1", type: "ground", params: {} },
			],
			[["V1.positive", "R1.a"], ["R1.b", "LED1.anode"], ["LED1.cathode", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
		),
	).toEqual([])
})
