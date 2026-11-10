import { expect, test } from "vitest"
import { checkSolution } from "../src/check"
import type { Lesson } from "../src/schema"
import { build } from "./build"

const lessonWith = (checks: Lesson["checks"]): Lesson => ({
	id: "t",
	title: "t",
	level: "beginner",
	kind: "lesson",
	summary: "",
	goal: "",
	steps: [],
	checks,
})

const divider = (top: number, bottom: number) =>
	build(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: top } },
			{ id: "R2", type: "resistor", params: { resistance: bottom } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "R2.a"], ["R2.b", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
	)

test("a failed reading check says what the circuit actually does", () => {
	const lesson = lessonWith([
		{ kind: "node-voltage", between: [2.4, 2.6], description: "Some point sits at 2.5 V" },
	])
	const result = checkSolution(divider(1000, 3000), lesson)
	expect(result.results[0]).toEqual({
		description: "Some point sits at 2.5 V",
		passed: false,
		found: "Points in the circuit sit at 0 V, 3.75 V, 5 V.",
	})
})

test("part counts are checked", () => {
	const result = checkSolution(divider(1, 1), lessonWith([{ kind: "has-part", type: "resistor", atLeast: 3, description: "Three resistors" }]))
	expect(result.results[0]).toMatchObject({ passed: false, found: "Found 2 resistors." })
})

test("readings are matched by size by default, and any part of the type may pass", () => {
	const lesson = lessonWith([
		{ kind: "reading", type: "resistor", quantity: "voltage", between: [3.7, 3.8], description: "One resistor drops about 3.75 V" },
	])
	expect(checkSolution(divider(3000, 1000), lesson).passed).toBe(true)
})

test("a circuit that can't be simulated fails with the engine's own explanation", () => {
	const shorted = build(
		[{ id: "V1", type: "voltage-source", params: { voltage: 5 } }],
		[["V1.positive", "V1.negative"]],
	)
	const result = checkSolution(shorted, lessonWith([{ kind: "no-errors", description: "It simulates" }]))
	expect(result.results[0]?.passed).toBe(false)
	expect(result.results[0]?.found).toContain("Short circuit")
})

/** A ×10 non-inverting amplifier of 0.2 V: its output pin at 2 V. */
const amplifier = () =>
	build(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 0.2 } },
			{ id: "U1", type: "op-amp", params: {} },
			{ id: "RF", type: "resistor", params: { resistance: 9000 } },
			{ id: "RG", type: "resistor", params: { resistance: 1000 } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[["V1.positive", "U1.nonInverting"], ["U1.output", "RF.a"], ["RF.b", "U1.inverting"], ["U1.inverting", "RG.a"], ["RG.b", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
	)

test("a pin's voltage is checked on every part of the type (an op-amp's output has no reading of its own)", () => {
	const check = (between: [number, number]) =>
		checkSolution(amplifier(), lessonWith([{ kind: "pin-voltage", type: "op-amp", pin: "output", between, description: "The output is 2 V" }]))
	expect(check([1.95, 2.05]).passed).toBe(true)
	expect(check([4, 5]).results[0]).toMatchObject({ passed: false, found: "U1 output is at 2 V." })
})

/** A clock into a T flip-flop with T held high: Q toggles on every rising edge, at half the clock's rate. */
const divider10Hz = () => {
	const circuit = build(
		[
			{ id: "CLK1", type: "clock", params: { frequency: 10 } },
			{ id: "HIGH", type: "logic-input", params: { high: true } },
			{ id: "FF1", type: "t-flip-flop", params: {} },
		],
		[["HIGH.out", "FF1.t"], ["CLK1.out", "FF1.clk"]],
	)
	return { ...circuit, simulation: { ...circuit.simulation, timeStep: 1e-4 } }
}

test("how fast a pin goes up and down is measured over time: a clock at 10 Hz, a flip-flop halving it", () => {
	const frequency = (type: "clock" | "t-flip-flop", pin: string, between: [number, number]) =>
		checkSolution(divider10Hz(), lessonWith([{ kind: "frequency", type, pin, after: 0.05, for: 1, between, description: "Blinks" }]))
			.results[0]
	expect(frequency("clock", "out", [9.5, 10.5])?.passed).toBe(true)
	expect(frequency("t-flip-flop", "q", [4.75, 5.25])?.passed).toBe(true)
	expect(frequency("t-flip-flop", "q", [9.5, 10.5])).toMatchObject({ passed: false, found: "FF1 q goes up and down at 5 Hz." })
	const still = checkSolution(amplifier(), lessonWith([{ kind: "frequency", type: "op-amp", pin: "output", after: 0.001, for: 0.001, between: [1, 2], description: "Blinks" }]))
	expect(still.results[0]).toMatchObject({ passed: false, found: "U1 output does not change." })
})

test("the gain at a frequency is checked at the scope probes, relative to the AC source: an RC low-pass at its corner", () => {
	const lowPass = build(
		[
			{ id: "AC1", type: "ac-source", params: { amplitude: 1, frequency: 1000, offset: 0, phase: 0, delay: 0 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "P1", type: "scope-probe", params: {} },
			{ id: "GND1", type: "ground", params: {} },
		],
		[["AC1.positive", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "GND1.terminal"], ["AC1.negative", "GND1.terminal"], ["C1.a", "P1.positive"], ["P1.negative", "GND1.terminal"]],
	)
	const gain = (between: [number, number]) =>
		checkSolution(lowPass, lessonWith([{ kind: "ac-gain", at: 159.155, between, description: "−3 dB at the corner" }])).results[0]
	expect(gain([-3.2, -2.8])?.passed).toBe(true)
	expect(gain([-1, 1])).toMatchObject({ passed: false, found: "At 159 Hz, P1 is at −3 dB." })
	const gainCheck = lessonWith([{ kind: "ac-gain", at: 1000, between: [0, 1], description: "Gain" }])
	expect(checkSolution(amplifier(), gainCheck).results[0]?.found).toContain("no scope probe")
	const probedNoSource = { ...lowPass, components: lowPass.components.filter((part) => part.id !== "AC1"), wires: lowPass.wires.filter((wire) => wire.from.componentId !== "AC1" && wire.to.componentId !== "AC1") }
	expect(checkSolution(probedNoSource, gainCheck).results[0]?.found).toContain("AC source")
})
