import { type Circuit, type Component, createCircuit, parseCircuit } from "@engineering-circuit/format"

type Part = Component extends infer Each ? (Each extends Component ? Omit<Each, "position" | "rotation"> : never) : never

/** A circuit from parts and "R1.a"-style wires, validated by the format (test helper). */
export function build(parts: Part[], wires: [string, string][]): Circuit {
	const pin = (label: string) => {
		const [componentId = "", name = ""] = label.split(".")
		return { componentId, pin: name }
	}
	const parsed = parseCircuit({
		...createCircuit("test"),
		components: parts.map((part, index) => ({ ...part, position: { x: index * 100, y: 0 }, rotation: 0 })),
		wires: wires.map(([from, to], index) => ({ id: `w${index + 1}`, from: pin(from), to: pin(to), bends: [] })),
	})
	if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
	return parsed.circuit
}
