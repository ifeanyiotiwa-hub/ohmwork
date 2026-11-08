import { type EditCommand, nextComponentId } from "@engineering-circuit/editing"
import type { Circuit, Component, Point, Wire } from "@engineering-circuit/format"

/** What Ctrl/⌘+C keeps: the chosen parts and the wires running between two of them. */
export type Copied = { components: Component[]; wires: Wire[] }

export function copyParts(circuit: Circuit, ids: ReadonlySet<string>): Copied {
	return {
		components: circuit.components.filter((component) => ids.has(component.id)),
		wires: circuit.wires.filter((wire) => ids.has(wire.from.componentId) && ids.has(wire.to.componentId)),
	}
}

/**
 * One batch command that adds copies of the parts (new ids, shifted by `offset`) and rewires them the same way,
 * so a paste is one undo step. Undefined when nothing was copied.
 */
export function pasteCommand(circuit: Circuit, copied: Copied, offset: Point): Extract<EditCommand, { type: "batch" }> | undefined {
	if (copied.components.length === 0) return undefined
	const renamed = new Map<string, string>()
	let working = circuit
	for (const component of copied.components) {
		const id = nextComponentId(working, component.type)
		renamed.set(component.id, id)
		working = { ...working, components: [...working.components, { ...component, id }] }
	}
	const idOf = (old: string) => renamed.get(old) ?? old
	const adds: EditCommand[] = copied.components.map((component) => ({
		type: "add-component",
		component: {
			id: idOf(component.id),
			type: component.type,
			params: component.params,
			rotation: component.rotation,
			position: { x: component.position.x + offset.x, y: component.position.y + offset.y },
		},
	}))
	const connects: EditCommand[] = copied.wires.map((wire) => ({
		type: "connect",
		from: { componentId: idOf(wire.from.componentId), pin: wire.from.pin },
		to: { componentId: idOf(wire.to.componentId), pin: wire.to.pin },
	}))
	const count = copied.components.length
	return { type: "batch", summary: `Pasted ${count} part${count === 1 ? "" : "s"}`, commands: [...adds, ...connects] }
}
