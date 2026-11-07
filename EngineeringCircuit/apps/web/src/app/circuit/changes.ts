import type { Circuit } from "@engineering-circuit/format"

export type ChangedIds = { components: ReadonlySet<string>; wires: ReadonlySet<string> }

export const NO_CHANGES: ChangedIds = { components: new Set(), wires: new Set() }

/** Parts and wires that are new or different in `after`. */
export function changedIds(before: Circuit, after: Circuit): ChangedIds {
	return { components: changed(before.components, after.components), wires: changed(before.wires, after.wires) }
}

function changed<Item extends { id: string }>(before: readonly Item[], after: readonly Item[]): Set<string> {
	const previous = new Map(before.map((item) => [item.id, JSON.stringify(item)]))
	return new Set(after.filter((item) => previous.get(item.id) !== JSON.stringify(item)).map((item) => item.id))
}
