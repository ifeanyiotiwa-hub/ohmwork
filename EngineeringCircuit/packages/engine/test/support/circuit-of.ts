import { type Circuit, type Component, createCircuit, parseCircuit } from "@engineering-circuit/format"
import { expect } from "vitest"

type Part = Component extends infer Each ? (Each extends Component ? Omit<Each, "position" | "rotation"> : never) : never
type PinName = `${string}.${string}`

export function circuitOf(parts: Part[], wires: [PinName, PinName][]): Circuit {
	const circuit = createCircuit("test")
	circuit.components = parts.map((part) => ({ ...part, position: { x: 0, y: 0 }, rotation: 0 }) as Component)
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
