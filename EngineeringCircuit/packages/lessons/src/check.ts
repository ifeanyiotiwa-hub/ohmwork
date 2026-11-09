import { type DcSolution, advanceTransient, initialTransientState, solveDc } from "@engineering-circuit/engine"
import { type Circuit, type ComponentType, formatSi } from "@engineering-circuit/format"
import type { Check, Lesson } from "./schema"

export type CheckResult = { description: string; passed: boolean; found: string }
export type SolutionResult = { passed: boolean; results: CheckResult[] }

/** Simulated steps a "reading-at" check may run before giving up (keeps a check quick). */
const MAX_STEPS = 200_000
const UNITS = { voltage: "V", current: "A", power: "W" } as const
const ACRONYMS: Readonly<Record<string, string>> = { led: "LED", npn: "NPN", pnp: "PNP", mosfet: "MOSFET", rgb: "RGB" }

/** "npn-transistor" → "NPN transistor", for messages. */
const nameOf = (type: ComponentType) =>
	type
		.split("-")
		.map((word) => ACRONYMS[word] ?? word)
		.join(" ")
const plural = (count: number, type: ComponentType) => `${count} ${nameOf(type)}${count === 1 ? "" : "s"}`
const inRange = (value: number, [low, high]: readonly [number, number]) => value >= low && value <= high
const errorsOf = (result: { errors: { message: string }[] }) => result.errors.map((error) => error.message).join(" ")

/** Runs every check of the lesson on the circuit. The lesson passes when every check does. */
export function checkSolution(circuit: Circuit, lesson: Lesson): SolutionResult {
	const results = lesson.checks.map((check) => ({ description: check.description, ...run(circuit, check) }))
	return { passed: results.every((result) => result.passed), results }
}

function run(circuit: Circuit, check: Check): Omit<CheckResult, "description"> {
	switch (check.kind) {
		case "has-part": {
			const count = circuit.components.filter((component) => component.type === check.type).length
			return { passed: count >= check.atLeast, found: `Found ${plural(count, check.type)}.` }
		}
		case "reading": {
			const pressed = check.pressed
				? new Set(circuit.components.filter((component) => component.type === "push-button").map((button) => button.id))
				: undefined
			const result = solveDc(circuit, pressed ? { pressed } : {})
			if (!result.ok) return { passed: false, found: errorsOf(result) }
			const held = check.pressed ? " (with the buttons held)" : ""
			return judgeReadings(circuit, result.solution, check, held)
		}
		case "node-voltage": {
			const result = solveDc(circuit)
			if (!result.ok) return { passed: false, found: errorsOf(result) }
			const voltages = [...new Set(Object.values(result.solution.pinVoltages).map((value) => Number(value.toPrecision(6))))].sort(
				(first, second) => first - second,
			)
			if (voltages.length === 0) return { passed: false, found: "The circuit has no connected points yet." }
			return {
				passed: voltages.some((voltage) => inRange(voltage, check.between)),
				found: `Points in the circuit sit at ${voltages.map((voltage) => formatSi(voltage, "V")).join(", ")}.`,
			}
		}
		case "reading-at": {
			const result = advanceTransient(circuit, initialTransientState(), check.at, { maxStep: circuit.simulation.timeStep, maxSteps: MAX_STEPS })
			if (!result.ok) return { passed: false, found: errorsOf(result) }
			if (!result.reachedUntil) return { passed: false, found: `Checking needs more than ${MAX_STEPS} time steps; raise the time step.` }
			return judgeReadings(circuit, result.solution, check, ` after ${formatSi(result.state.time, "s")}`)
		}
		case "truth-table":
			return truthTable(circuit, check)
		case "no-errors": {
			const result = solveDc(circuit)
			return result.ok ? { passed: true, found: "It simulates without errors." } : { passed: false, found: errorsOf(result) }
		}
	}
}

function judgeReadings(
	circuit: Circuit,
	solution: DcSolution,
	check: Extract<Check, { kind: "reading" | "reading-at" }>,
	when: string,
): Omit<CheckResult, "description"> {
	const parts = circuit.components.filter((component) => component.type === check.type)
	if (parts.length === 0) return { passed: false, found: `There is no ${nameOf(check.type)} in the circuit.` }
	const values = parts.map((part) => {
		const reading = solution.readings[part.id] ?? { voltage: 0, current: 0 }
		const raw = check.quantity === "power" ? reading.voltage * reading.current : reading[check.quantity]
		const value = "signed" in check && check.signed ? raw : Math.abs(raw)
		return { id: part.id, value }
	})
	const verb = { voltage: "has", current: "carries", power: "uses" }[check.quantity]
	return {
		passed: values.some(({ value }) => inRange(value, check.between)),
		found: `${values.map(({ id, value }) => `${id} ${verb} ${formatSi(value, UNITS[check.quantity])}`).join("; ")}${when}.`,
	}
}

const naturalOrder = (first: string, second: string) => first.localeCompare(second, undefined, { numeric: true })
const bits = (row: readonly boolean[]) => row.map((bit) => (bit ? "1" : "0")).join("")

function truthTable(circuit: Circuit, check: Extract<Check, { kind: "truth-table" }>): Omit<CheckResult, "description"> {
	const inputs = circuit.components.filter((component) => component.type === "logic-input").map((part) => part.id).sort(naturalOrder)
	const outputs = circuit.components.filter((component) => component.type === "logic-output").map((part) => part.id).sort(naturalOrder)
	const inputCount = check.rows[0]?.inputs.length ?? 0
	const outputCount = check.rows[0]?.outputs.length ?? 0
	if (inputs.length !== inputCount) return { passed: false, found: `Found ${plural(inputs.length, "logic-input")}; this needs ${inputCount}.` }
	if (outputs.length < outputCount) return { passed: false, found: `Found ${plural(outputs.length, "logic-output")}; this needs ${outputCount}.` }

	const actual: boolean[][] = []
	for (const row of check.rows) {
		const trial: Circuit = {
			...circuit,
			components: circuit.components.map((component) => {
				const index = inputs.indexOf(component.id)
				return index === -1 || component.type !== "logic-input"
					? component
					: { ...component, params: { high: row.inputs[index] ?? false } }
			}),
		}
		const result = solveDc(trial)
		if (!result.ok) return { passed: false, found: errorsOf(result) }
		const threshold = circuit.simulation.logicHigh / 2
		actual.push(outputs.map((id) => (result.solution.pinVoltages[`${id}:in`] ?? 0) > threshold))
	}

	// Every expected column must match a different actual output column, in any order.
	const columnOf = (table: readonly (readonly boolean[])[], index: number) => table.map((row) => row[index] ?? false)
	const free = new Set(outputs.map((_, index) => index))
	const matched = Array.from({ length: outputCount }, (_, index) => {
		const expected = bits(columnOf(check.rows.map((row) => row.outputs), index))
		const found = [...free].find((candidate) => bits(columnOf(actual, candidate)) === expected)
		if (found !== undefined) free.delete(found)
		return found !== undefined
	})
	const table = check.rows.map((row, index) => `${bits(row.inputs)}→${bits(actual[index] ?? [])}`).join(", ")
	return {
		passed: matched.every(Boolean),
		found: `With ${inputs.join(", ")} as inputs, ${outputs.join(", ")} gave: ${table}.`,
	}
}
