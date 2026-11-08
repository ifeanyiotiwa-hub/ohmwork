import { type Circuit, type Component, createCircuit, definitionOf, parseCircuit } from "@engineering-circuit/format"
import { expect } from "vitest"

/** A part without layout; params a test doesn't care about (ratings, say) come from the catalog defaults. */
type Part = Component extends infer Each
	? Each extends Component
		? Omit<Each, "position" | "rotation" | "params"> & { params: Partial<Each["params"]> }
		: never
	: never
type PinName = `${string}.${string}`

export function circuitOf(parts: Part[], wires: [PinName, PinName][]): Circuit {
	const circuit = createCircuit("test")
	circuit.components = parts.map(
		(part) =>
			({ ...part, params: { ...definitionOf(part.type).defaults, ...part.params }, position: { x: 0, y: 0 }, rotation: 0 }) as Component,
	)
	circuit.wires = wires.map(([from, to], index) => ({
		id: `w${index + 1}`,
		from: toPinRef(from),
		to: toPinRef(to),
		bends: [],
	}))

	const parsed = parseCircuit(circuit)
	if (!parsed.ok) throw new Error(`Invalid test circuit: ${JSON.stringify(parsed.errors)}`)
	return parsed.circuit
}

function toPinRef(name: PinName) {
	const [componentId = "", pin = ""] = name.split(".")
	return { componentId, pin }
}

export function expectClose(actual: number | undefined, expected: number, relativeTolerance = 1e-9) {
	expect(actual).toBeDefined()
	const tolerance = Math.max(Math.abs(expected) * relativeTolerance, 1e-12)
	expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(tolerance)
}
