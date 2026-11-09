import { LED_MODELS } from "@engineering-circuit/format"
import { describe, expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { circuitOf } from "../support/circuit-of"

const warningsOf = (parts: Parameters<typeof circuitOf>[0], wires: Parameters<typeof circuitOf>[1]) => {
	const result = solveDc(circuitOf(parts, wires))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution.warnings.map((warning) => warning.message)
}

test.each([
	["red", 1.85],
	["green", 3.3],
	["blue", 3.3],
] as const)("an RGB LED's %s pin drops the datasheet voltage (%s V, Kingbright WP154A4SUREQBFZGW: 1.9/3.3/3.3 ±0.1 V) at 20 mA", (colour, volts) => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "I1", type: "current-source", params: { current: 0.02 } },
				{ id: "RGB1", type: "rgb-led", params: { commonCathode: true } },
			],
			[[`I1.positive`, `RGB1.${colour}`], ["RGB1.common", "I1.negative"]],
		),
	)
	expect(result.ok && result.solution.ports[`RGB1/${colour}`]?.voltage).toBeCloseTo(volts, 1)
})

test("an RGB LED colour driven past its rating is named in the burn-out warning", () => {
	const messages = warningsOf(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 47, powerRating: 1 } },
			{ id: "RGB1", type: "rgb-led", params: { commonCathode: true } },
			{ id: "GND", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "RGB1.green"], ["RGB1.common", "GND.terminal"], ["V1.negative", "GND.terminal"]],
	)
	expect(messages).toContainEqual(expect.stringMatching(/^RGB1 green carries 3\d(\.\d+)? mA, but it is rated for 25 mA: a real one would burn out\./))
	expect(messages.join(" ")).not.toContain("RGB1 red")
})

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

test("a common-anode RGB LED lights a colour when that pin is pulled low (current flows from the common pin into it)", () => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "R1", type: "resistor", params: { resistance: 220 } },
				{ id: "RGB1", type: "rgb-led", params: { commonCathode: false } },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "RGB1.common"], ["RGB1.red", "R1.a"], ["R1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		),
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	// (5 − 1.85 V) / 220 Ω ≈ 14 mA through red; nothing through the others.
	expect(Math.abs(result.solution.ports["RGB1/red"]?.current ?? 0)).toBeCloseTo(0.0143, 3)
	expect(Math.abs(result.solution.ports["RGB1/green"]?.current ?? 1)).toBeLessThan(1e-9)
})

describe("ratings from datasheets: Zener 1N4734A, NPN 2N3904, PNP 2N3906, N-MOSFET 2N7002, P-MOSFET BSS84", () => {
	test("a Zener held at its breakdown carries more than 162 mA (1N4734A IZM): it would burn out", () => {
		const messages = warningsOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 12 } },
				{ id: "R1", type: "resistor", params: { resistance: 20, powerRating: 10 } },
				{ id: "DZ1", type: "zener-diode", params: {} },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "R1.a"], ["R1.b", "DZ1.cathode"], ["DZ1.anode", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		)
		expect(messages).toContainEqual(expect.stringMatching(/^DZ1 carries 3\d\d mA, but it is rated for 162 mA: a real one would burn out\./))
	})

	test("a transistor switching 300 mA is over its 200 mA collector rating (2N3904)", () => {
		const messages = warningsOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "RC", type: "resistor", params: { resistance: 15, powerRating: 10 } },
				{ id: "RB", type: "resistor", params: { resistance: 470 } },
				{ id: "Q1", type: "npn-transistor", params: {} },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "RC.a"],
				["RC.b", "Q1.collector"],
				["V1.positive", "RB.a"],
				["RB.b", "Q1.base"],
				["Q1.emitter", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		)
		expect(messages).toContainEqual(expect.stringMatching(/^Q1 carries 3\d\d mA into its collector, but it is rated for 200 mA/))
	})

	test("a transistor half on with 10 V across it turns more than its 625 mW into heat (2N3904)", () => {
		const messages = warningsOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 20 } },
				{ id: "RC", type: "resistor", params: { resistance: 100, powerRating: 10 } },
				{ id: "IB", type: "current-source", params: { current: 0.001 } },
				{ id: "Q1", type: "npn-transistor", params: {} },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "RC.a"],
				["RC.b", "Q1.collector"],
				["IB.positive", "Q1.base"],
				["IB.negative", "GND.terminal"],
				["Q1.emitter", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		)
		// β 100 × 1 mA = 100 mA (under 200 mA), with 20 − 10 = 10 V across it: about 1 W.
		expect(messages).toContainEqual(expect.stringMatching(/^Q1 turns 1(\.\d+)? W into heat, but it is rated for 625 mW/))
		expect(messages.join(" ")).not.toContain("into its collector")
	})

	const mosfetThrough10Ohms = (transconductance: number) =>
		warningsOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "RD", type: "resistor", params: { resistance: 10, powerRating: 10 } },
				{ id: "M1", type: "n-mosfet", params: { transconductance } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "RD.a"],
				["RD.b", "M1.drain"],
				["V1.positive", "M1.gate"],
				["M1.source", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		)

	test("a MOSFET at 5 V gate, 10 Ω load: about 122 mA with 3.8 V across it is 462 mW, over 370 mW (2N7002)", () => {
		const messages = mosfetThrough10Ohms(0.02)
		expect(messages).toContainEqual(expect.stringMatching(/^M1 turns 462 mW into heat, but it is rated for 370 mW/))
		expect(messages.join(" ")).not.toContain("into its drain")
	})

	test("a stronger MOSFET fully on through 10 Ω carries more than its 170 mA drain rating", () => {
		expect(mosfetThrough10Ohms(0.2)).toContainEqual(expect.stringMatching(/^M1 carries \d+ mA into its drain, but it is rated for 170 mA/))
	})

	test("parts within their ratings raise no burn-out warning", () => {
		const messages = warningsOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "RC", type: "resistor", params: { resistance: 1000 } },
				{ id: "RB", type: "resistor", params: { resistance: 10000 } },
				{ id: "Q1", type: "npn-transistor", params: {} },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "RC.a"], ["RC.b", "Q1.collector"], ["V1.positive", "RB.a"], ["RB.b", "Q1.base"], ["Q1.emitter", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		)
		expect(messages.join(" ")).not.toContain("burn out")
	})
})

describe("LED 7-segment display (Kingbright SC56-11EWA: 1.9 V at 10 mA per segment, 30 mA max)", () => {
	const display = (commonCathode: boolean, resistance: number) => {
		const result = solveDc(
			circuitOf(
				[
					{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
					{ id: "R1", type: "resistor", params: { resistance, powerRating: 10 } },
					{ id: "SEG1", type: "seven-segment-led", params: { commonCathode } },
					{ id: "GND", type: "ground", params: {} },
				],
				commonCathode
					? [["V1.positive", "R1.a"], ["R1.b", "SEG1.a"], ["SEG1.common", "GND.terminal"], ["V1.negative", "GND.terminal"]]
					: [["V1.positive", "SEG1.common"], ["SEG1.a", "R1.a"], ["R1.b", "GND.terminal"], ["V1.negative", "GND.terminal"]],
			),
		)
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		return result.solution
	}

	test("a segment drops its datasheet 1.9 V at 10 mA", () => {
		const result = solveDc(
			circuitOf(
				[
					{ id: "I1", type: "current-source", params: { current: 0.01 } },
					{ id: "SEG1", type: "seven-segment-led", params: { commonCathode: true } },
				],
				[["I1.positive", "SEG1.b"], ["SEG1.common", "I1.negative"]],
			),
		)
		expect(result.ok && result.solution.ports["SEG1/b"]?.voltage).toBeCloseTo(1.9, 3)
	})

	test("common cathode: current through the driven segment only", () => {
		const { ports } = display(true, 330)
		expect(Math.abs(ports["SEG1/a"]?.current ?? 0)).toBeCloseTo((5 - 1.9) / 330, 3)
		expect(Math.abs(ports["SEG1/g"]?.current ?? 1)).toBeLessThan(1e-9)
	})

	test("common anode: the segment lights when its pin is pulled low", () => {
		expect(Math.abs(display(false, 330).ports["SEG1/a"]?.current ?? 0)).toBeCloseTo((5 - 1.9) / 330, 3)
	})

	test("a segment driven past 30 mA is named in the burn-out warning", () => {
		const messages = display(true, 47).warnings.map((warning) => warning.message)
		expect(messages).toContainEqual(expect.stringMatching(/^SEG1 segment a carries 6\d(\.\d+)? mA, but it is rated for 30 mA: a real one would burn out\./))
	})
})

test("burn-out warnings are marked as such, so the app can show the part overheating", () => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "LED1", type: "led", params: {} },
				{ id: "GND", type: "ground", params: {} },
			],
			[["V1.positive", "LED1.anode"], ["LED1.cathode", "GND.terminal"], ["V1.negative", "GND.terminal"]],
		),
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expect(result.solution.warnings).toContainEqual(expect.objectContaining({ componentIds: ["LED1"], kind: "burn-out" }))
	expect(result.solution.warnings.filter((warning) => warning.kind === "burn-out").every((warning) => warning.message.includes("burn out"))).toBe(true)
})
