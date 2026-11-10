import type { Circuit, Subcircuit, Wire } from "./circuit"
import { type Component, pinsOf } from "./components/catalog"

/** Parts inside a chip are named "<chip part id>.<their id>" ("X1.R1"); a dot is kept out of every other id. */
export const CHIP_PATH_SEPARATOR = "."
/** Deeper nesting than this is refused when parsing (and a loop never expands for ever). */
export const MAX_CHIP_DEPTH = 8

export type ChipPart = Extract<Component, { type: "subcircuit" }>
export const isChip = (part: Component): part is ChipPart => part.type === "subcircuit"

type WithChips = { readonly subcircuits: readonly Subcircuit[] }

export const chipDefinition = (circuit: WithChips, part: ChipPart): Subcircuit | undefined =>
	circuit.subcircuits.find((definition) => definition.id === part.params.definition)

/** A part's pins: its type's, or for a chip its definition's. */
export function pinsOfPart(part: Component, circuit: WithChips): readonly string[] {
	if (!isChip(part)) return pinsOf(part.type)
	return chipDefinition(circuit, part)?.pins.map((pin) => pin.name) ?? []
}

const expanded = new WeakSet<Circuit>()
const cache = new WeakMap<Circuit, Circuit>()

/**
 * The circuit as the engine sees it: every chip's parts and wires added, renamed under the chip ("X1.R1", "X1.w1"),
 * chips inside chips too ("X2.X1.R1"). The chip parts stay, carrying nothing; their pins join the pins they stand for
 * by name (namedPins). Cached per circuit, and an expanded circuit is returned as it is.
 */
export function expandSubcircuits(circuit: Circuit): Circuit {
	if (expanded.has(circuit) || !circuit.components.some(isChip)) return circuit
	const known = cache.get(circuit)
	if (known) return known
	const components: Component[] = [...circuit.components]
	const wires: Wire[] = [...circuit.wires]
	const inside = (chip: ChipPart, depth: number) => {
		const definition = chipDefinition(circuit, chip)
		if (!definition || depth >= MAX_CHIP_DEPTH) return
		const renamed = (id: string) => `${chip.id}${CHIP_PATH_SEPARATOR}${id}`
		for (const part of definition.components) {
			const placed = { ...part, id: renamed(part.id) }
			components.push(placed)
			if (isChip(placed)) inside(placed, depth + 1)
		}
		for (const wire of definition.wires) {
			wires.push({
				...wire,
				id: renamed(wire.id),
				from: { ...wire.from, componentId: renamed(wire.from.componentId) },
				to: { ...wire.to, componentId: renamed(wire.to.componentId) },
			})
		}
	}
	for (const part of circuit.components) if (isChip(part)) inside(part, 0)
	const result = { ...circuit, components, wires }
	expanded.add(result)
	cache.set(circuit, result)
	return result
}
