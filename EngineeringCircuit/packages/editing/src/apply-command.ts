import {
	type Circuit,
	type CircuitError,
	type Component,
	type ComponentType,
	type PinRef,
	type Point,
	idPrefixOf,
	parseCircuit,
} from "@engineering-circuit/format"

const GRID_SPACING = 100
const GRID_COLUMNS = 8

export type NewComponent = {
	id?: string | undefined
	type: ComponentType
	params: Record<string, unknown>
	position?: Point | undefined
	rotation?: Component["rotation"] | undefined
}

export type EditCommand =
	| { type: "add-component"; component: NewComponent }
	| { type: "remove-component"; componentId: string }
	| { type: "connect"; from: PinRef; to: PinRef }
	| { type: "disconnect"; wireId: string }
	| { type: "set-parameter"; componentId: string; name: string; value: unknown }

export type EditResult = { ok: true; circuit: Circuit; summary: string } | { ok: false; errors: CircuitError[] }

type Proposal = { candidate: unknown; summary: string } | { errors: CircuitError[] }

export function applyCommand(circuit: Circuit, command: EditCommand): EditResult {
	const proposal = propose(structuredClone(circuit), command)
	if ("errors" in proposal) return { ok: false, errors: proposal.errors }

	const parsed = parseCircuit(proposal.candidate)
	return parsed.ok ? { ok: true, circuit: parsed.circuit, summary: proposal.summary } : parsed
}

function propose(draft: Circuit, command: EditCommand): Proposal {
	switch (command.type) {
		case "add-component": {
			const { type, params } = command.component
			const id = command.component.id ?? nextId(draft.components, idPrefixOf(type))
			const component = {
				id,
				type,
				position: command.component.position ?? gridPosition(draft.components.length),
				rotation: command.component.rotation ?? 0,
				params,
			}
			return { candidate: { ...draft, components: [...draft.components, component] }, summary: `Added ${type} "${id}"` }
		}

		case "remove-component": {
			const target = draft.components.find((component) => component.id === command.componentId)
			if (!target) return notFound("components", "component", command.componentId)
			const attached = (end: PinRef) => end.componentId === target.id
			return {
				candidate: {
					...draft,
					components: draft.components.filter((component) => component !== target),
					wires: draft.wires.filter((wire) => !attached(wire.from) && !attached(wire.to)),
				},
				summary: `Removed ${target.type} "${target.id}"`,
			}
		}

		case "connect": {
			const existing = draft.wires.find(
				(wire) =>
					(samePin(wire.from, command.from) && samePin(wire.to, command.to)) ||
					(samePin(wire.from, command.to) && samePin(wire.to, command.from)),
			)
			if (existing) {
				const message = `${pinName(existing.from)} and ${pinName(existing.to)} are already connected by wire ${existing.id}`
				return { errors: [{ path: "wires", message }] }
			}
			const wire = { id: nextId(draft.wires, "w"), from: command.from, to: command.to, bends: [] }
			return {
				candidate: { ...draft, wires: [...draft.wires, wire] },
				summary: `Connected ${pinName(command.from)} to ${pinName(command.to)}`,
			}
		}

		case "disconnect": {
			const target = draft.wires.find((wire) => wire.id === command.wireId)
			if (!target) return notFound("wires", "wire", command.wireId)
			return {
				candidate: { ...draft, wires: draft.wires.filter((wire) => wire !== target) },
				summary: `Removed wire ${target.id} (${pinName(target.from)} – ${pinName(target.to)})`,
			}
		}

		case "set-parameter": {
			const target = draft.components.find((component) => component.id === command.componentId)
			if (!target) return notFound("components", "component", command.componentId)
			const updated = { ...target, params: { ...target.params, [command.name]: command.value } }
			return {
				candidate: {
					...draft,
					components: draft.components.map((component) => (component === target ? updated : component)),
				},
				summary: `Set ${target.id} ${command.name} to ${String(command.value)}`,
			}
		}
	}
}

function nextId(items: readonly { id: string }[], prefix: string): string {
	const taken = new Set(items.map((item) => item.id))
	let number = 1
	while (taken.has(`${prefix}${number}`)) number++
	return `${prefix}${number}`
}

const gridPosition = (index: number): Point => ({
	x: (index % GRID_COLUMNS) * GRID_SPACING,
	y: Math.floor(index / GRID_COLUMNS) * GRID_SPACING,
})

const samePin = (first: PinRef, second: PinRef) => first.componentId === second.componentId && first.pin === second.pin

const pinName = (ref: PinRef) => `${ref.componentId}.${ref.pin}`

const notFound = (path: string, kind: string, id: string): Proposal => ({
	errors: [{ path, message: `No ${kind} with id "${id}"` }],
})
