import { createCircuit } from "@engineering-circuit/format"
import { describe, expect, test } from "vitest"
import { checkSolution } from "../src/check"
import { LESSONS, lessonById } from "../src/lessons"
import { lessonSchema } from "../src/schema"
import { build } from "./build"
import { SOLUTIONS } from "./solutions"

test("there are five starter lessons, each valid and with a reference solution", () => {
	expect(LESSONS.map((lesson) => lesson.id)).toEqual(["light-an-led", "voltage-divider", "rc-charging", "transistor-switch", "half-adder"])
	for (const lesson of LESSONS) {
		expect(lessonSchema.safeParse(lesson).success, lesson.id).toBe(true)
		expect(SOLUTIONS[lesson.id], lesson.id).toBeDefined()
	}
})

describe.each(LESSONS.map((lesson) => [lesson.id, lesson] as const))("%s", (id, lesson) => {
	test("a correct circuit passes every check", () => {
		const solution = SOLUTIONS[id]
		if (!solution) throw new Error("missing solution")
		const result = checkSolution(solution, lesson)
		expect(result.results.filter((check) => !check.passed)).toEqual([])
		expect(result.passed).toBe(true)
	})

	test("an empty circuit does not pass, and every failed check says what it found", () => {
		const result = checkSolution(createCircuit("Empty"), lesson)
		expect(result.passed).toBe(false)
		for (const check of result.results.filter((entry) => !entry.passed)) expect(check.found.length).toBeGreaterThan(0)
	})
})

test("lessons are found by id", () => {
	expect(lessonById("half-adder")?.title).toBe("Build a half adder")
	expect(lessonById("nope")).toBeUndefined()
})

describe("typical mistakes are caught, with what went wrong", () => {
	const LED = { color: "red", saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 } as const

	test("an LED with no resistor fails the current check and shows the huge current", () => {
		const noResistor = build(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "LED1", type: "led", params: LED },
				{ id: "GND1", type: "ground", params: {} },
			],
			[["V1.positive", "LED1.anode"], ["LED1.cathode", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
		)
		const lesson = lessonById("light-an-led")
		if (!lesson) throw new Error("missing lesson")
		const current = checkSolution(noResistor, lesson).results.find((result) => result.description.startsWith("An LED carries"))
		expect(current?.passed).toBe(false)
		expect(current?.found).toMatch(/^LED1 carries \d+(\.\d+)? A\.$/)
	})

	test("an LED that stays lit without the button fails the transistor lesson", () => {
		const alwaysOn = build(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "R1", type: "resistor", params: { resistance: 220 } },
				{ id: "LED1", type: "led", params: LED },
				{ id: "Q1", type: "npn-transistor", params: { beta: 100, betaReverse: 1, saturationCurrent: 1e-13 } },
				{ id: "PB1", type: "push-button", params: { normallyOpen: true } },
				{ id: "GND1", type: "ground", params: {} },
			],
			[["V1.positive", "R1.a"], ["R1.b", "LED1.anode"], ["LED1.cathode", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
		)
		const lesson = lessonById("transistor-switch")
		if (!lesson) throw new Error("missing lesson")
		const released = checkSolution(alwaysOn, lesson).results.find((result) => result.description.includes("released"))
		expect(released).toMatchObject({ passed: false, found: "LED1 carries 14.5 mA." })
	})
})
