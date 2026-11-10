import {
	type Circuit,
	type CircuitError,
	type Component,
	LAYOUT_GRID,
	type PinRef,
	type Point,
	type Subcircuit,
	type Wire,
	chipDefinition,
	idPrefixOf,
	isChip,
	rotate,
} from "@engineering-circuit/format"

export type MakeSubcircuit = { componentIds: readonly string[]; name: string; pins?: readonly { name: string; to: PinRef }[] | undefined }
export type Made = { candidate: Circuit; summary: string } | { errors: CircuitError[] }

const CHIP_PREFIX = "X"
const PIN_NAME_LENGTH = 16

const pinKeyOf = (ref: PinRef) => `${ref.componentId}:${ref.pin}`
const snapped = (value: number) => Math.round(value / LAYOUT_GRID) * LAYOUT_GRID

/**
 * The chosen parts become a chip (a subcircuit definition) and one part placing it, where they were: the wires between
 * them go inside, and each wire to the rest of the circuit now ends on a chip pin standing for the inside pin it reached.
 * Positions inside are kept relative to the chip's middle. The result is validated like any edit (parseCircuit).
 */
export function makeSubcircuit(draft: Circuit, { componentIds, name, pins: named = [] }: MakeSubcircuit): Made {
	const chosen = new Set(componentIds)
	const missing = componentIds.filter((id) => !draft.components.some((part) => part.id === id))
	if (missing.length > 0) return { errors: missing.map((id) => ({ path: "componentIds", message: `No component with id "${id}"` })) }

	const isInside = (ref: PinRef) => chosen.has(ref.componentId)
	const insideWires = draft.wires.filter((wire) => isInside(wire.from) && isInside(wire.to))
	const crossing = draft.wires.filter((wire) => isInside(wire.from) !== isInside(wire.to))
	if (crossing.length === 0) {
		return { errors: [{ path: "componentIds", message: "Those parts connect to nothing else, so a chip of them would have no pins" }] }
	}

	// One chip pin per inside pin a wire leaves from, in wire order.
	const pinFor = new Map<string, { name: string; to: PinRef }>()
	for (const wire of crossing) {
		const inner = isInside(wire.from) ? wire.from : wire.to
		const key = pinKeyOf(inner)
		if (pinFor.has(key)) continue
		const given = named.find((pin) => pinKeyOf(pin.to) === key)
		pinFor.set(key, { name: given?.name ?? `${inner.componentId}_${inner.pin}`.slice(0, PIN_NAME_LENGTH), to: inner })
	}

	const parts = draft.components.filter((part) => chosen.has(part.id))
	const xs = parts.map((part) => part.position.x)
	const ys = parts.map((part) => part.position.y)
	const middle: Point = { x: snapped((Math.min(...xs) + Math.max(...xs)) / 2), y: snapped((Math.min(...ys) + Math.max(...ys)) / 2) }
	const definition: Subcircuit = {
		id: freeChipId(draft, name),
		name,
		pins: [...pinFor.values()],
		components: parts.map((part) => ({ ...part, position: { x: part.position.x - middle.x, y: part.position.y - middle.y } })),
		wires: insideWires,
	}
	const chipId = nextChipId(draft)
	const outerEnd = (ref: PinRef): PinRef => (isInside(ref) ? { componentId: chipId, pin: pinFor.get(pinKeyOf(ref))?.name ?? ref.pin } : ref)
	const rewired: Wire[] = crossing.map((wire) => ({ ...wire, from: outerEnd(wire.from), to: outerEnd(wire.to), bends: [] }))
	const candidate: Circuit = {
		...draft,
		subcircuits: [...draft.subcircuits, definition],
		components: [
			...draft.components.filter((part) => !chosen.has(part.id)),
			{ id: chipId, type: "subcircuit", position: middle, rotation: 0, params: { definition: definition.id } },
		],
		wires: draft.wires.flatMap((wire) => {
			if (insideWires.includes(wire)) return []
			return [rewired[crossing.indexOf(wire)] ?? wire]
		}),
	}
	const count = parts.length
	return { candidate, summary: `Made chip "${name}" (${chipId}) from ${count} part${count === 1 ? "" : "s"}` }
}

/** A chip id from its name ("My Divider": "my-divider"), numbered when taken ("divider-2"). */
function freeChipId(circuit: Circuit, name: string): string {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
	const base = /^[a-z]/.test(slug) ? slug : `chip-${slug}`.replace(/-+$/, "")
	const taken = new Set(circuit.subcircuits.map((definition) => definition.id))
	if (!taken.has(base)) return base
	let number = 2
	while (taken.has(`${base}-${number}`)) number++
	return `${base}-${number}`
}

const nextChipId = (circuit: Circuit): string => nextFree(new Set(circuit.components.map((part) => part.id)), CHIP_PREFIX)

function nextFree(taken: ReadonlySet<string>, prefix: string): string {
	let number = 1
	while (taken.has(`${prefix}${number}`)) number++
	return `${prefix}${number}`
}

const WIRE_PREFIX = "w"

/**
 * The chip's parts and wires come back into the circuit where the chip is (turned with it), keeping their ids where
 * free and otherwise numbered on; wires to the chip's pins now end on the pins inside they stood for. The definition
 * stays, as other copies may use it.
 */
export function unpackSubcircuit(draft: Circuit, componentId: string): Made {
	const chip = draft.components.find((part) => part.id === componentId)
	if (!chip || !isChip(chip)) return { errors: [{ path: "componentId", message: `No chip with id "${componentId}"` }] }
	const definition = chipDefinition(draft, chip)
	if (!definition) return { errors: [{ path: "componentId", message: `No chip "${chip.params.definition}" in this circuit` }] }

	const takenParts = new Set(draft.components.filter((part) => part !== chip).map((part) => part.id))
	const renamed = new Map<string, string>()
	for (const part of definition.components) {
		const id = takenParts.has(part.id) ? nextFree(takenParts, idPrefixOf(part.type)) : part.id
		takenParts.add(id)
		renamed.set(part.id, id)
	}
	const outside = (ref: PinRef): PinRef => ({ componentId: renamed.get(ref.componentId) ?? ref.componentId, pin: ref.pin })
	const parts: Component[] = definition.components.map((part) => {
		const offset = rotate(part.position, chip.rotation)
		return {
			...part,
			id: renamed.get(part.id) ?? part.id,
			position: { x: chip.position.x + offset.x, y: chip.position.y + offset.y },
			rotation: turned(part.rotation, chip.rotation),
		}
	})

	const takenWires = new Set(draft.wires.map((wire) => wire.id))
	const insideWires: Wire[] = definition.wires.map((wire) => {
		const id = takenWires.has(wire.id) ? nextFree(takenWires, WIRE_PREFIX) : wire.id
		takenWires.add(id)
		return { ...wire, id, from: outside(wire.from), to: outside(wire.to), bends: [] }
	})
	const throughPin = (ref: PinRef): PinRef => {
		if (ref.componentId !== chip.id) return ref
		const pin = definition.pins.find((candidate) => candidate.name === ref.pin)
		return pin ? outside(pin.to) : ref
	}
	const candidate: Circuit = {
		...draft,
		components: [...draft.components.filter((part) => part !== chip), ...parts],
		wires: [
			...draft.wires.map((wire) =>
				wire.from.componentId === chip.id || wire.to.componentId === chip.id
					? { ...wire, from: throughPin(wire.from), to: throughPin(wire.to), bends: [] }
					: wire,
			),
			...insideWires,
		],
	}
	const count = parts.length
	return { candidate, summary: `Unpacked ${chip.id} ("${definition.name}") into ${count} part${count === 1 ? "" : "s"}` }
}

/** Renames a chip's pin, and the pin at the end of every wire to a copy of that chip (in the circuit and in other chips). */
export function renameSubcircuitPin(draft: Circuit, definitionId: string, from: string, to: string): Made {
	const definition = draft.subcircuits.find((candidate) => candidate.id === definitionId)
	if (!definition) return { errors: [{ path: "definition", message: `No chip "${definitionId}" in this circuit` }] }
	if (!definition.pins.some((pin) => pin.name === from)) {
		return { errors: [{ path: "pin", message: `Chip "${definition.name}" has no pin "${from}"` }] }
	}
	if (from !== to && definition.pins.some((pin) => pin.name === to)) {
		return { errors: [{ path: "name", message: `Chip "${definition.name}" already has a pin "${to}"` }] }
	}
	const copies = (components: readonly Component[]) =>
		new Set(components.filter((part) => isChip(part) && part.params.definition === definitionId).map((part) => part.id))
	const rewired = (wires: readonly Wire[], ids: ReadonlySet<string>): Wire[] => {
		const end = (ref: PinRef): PinRef => (ids.has(ref.componentId) && ref.pin === from ? { ...ref, pin: to } : ref)
		return wires.map((wire) => ({ ...wire, from: end(wire.from), to: end(wire.to) }))
	}
	const candidate: Circuit = {
		...draft,
		wires: rewired(draft.wires, copies(draft.components)),
		subcircuits: draft.subcircuits.map((chip) => ({
			...chip,
			pins: chip.id === definitionId ? chip.pins.map((pin) => (pin.name === from ? { ...pin, name: to } : pin)) : chip.pins,
			wires: rewired(chip.wires, copies(chip.components)),
		})),
	}
	return { candidate, summary: `Renamed pin ${from} of chip "${definition.name}" to ${to}` }
}

/** A part's rotation after its chip's: the two quarter-turn counts added. */
function turned(rotation: Component["rotation"], by: Component["rotation"]): Component["rotation"] {
	const QUARTER_TURNS = [0, 90, 180, 270] as const
	return QUARTER_TURNS[(QUARTER_TURNS.indexOf(rotation) + QUARTER_TURNS.indexOf(by)) % QUARTER_TURNS.length] ?? 0
}
