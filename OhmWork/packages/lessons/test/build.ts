import { type Circuit, type Component, createCircuit, definitionOf, parseCircuit } from "@ohmwork/format"

/** A part without layout; params a test doesn't care about come from the catalog defaults. */
type Part = Component extends infer Each
	? Each extends Component
		? Omit<Each, "position" | "rotation" | "params"> & { params: Partial<Each["params"]> }
		: never
	: never

/** A circuit from parts and "R1.a"-style wires, validated by the format (test helper). */
export function build(parts: Part[], wires: [string, string][]): Circuit {
	const pin = (label: string) => {
		const [componentId = "", name = ""] = label.split(".")
		return { componentId, pin: name }
	}
	const parsed = parseCircuit({
		...createCircuit("test"),
		components: parts.map((part, index) => ({
			...part,
			params: { ...definitionOf(part.type).defaults, ...part.params },
			position: { x: index * 100, y: 0 },
			rotation: 0,
		})),
		wires: wires.map(([from, to], index) => ({ id: `w${index + 1}`, from: pin(from), to: pin(to), bends: [] })),
	})
	if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
	return parsed.circuit
}
