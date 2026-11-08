import { expect, test } from "vitest"
import { checkSolution } from "../src/check"
import type { Lesson } from "../src/schema"
import { build } from "./build"

const lessonWith = (checks: Lesson["checks"]): Lesson => ({
	id: "t",
	title: "t",
	level: "beginner",
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
