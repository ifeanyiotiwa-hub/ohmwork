import {
	type Circuit,
	type CircuitError,
	type Component,
	type ComponentType,
	LED_COLORS,
	LED_MODELS,
	type LedColor,
	type LedModel,
	type Note,
	type PinRef,
	type Point,
	definitionOf,
	idPrefixOf,
	parseCircuit,
} from "@engineering-circuit/format"
import type { EditCommand } from "./edit-command"
import { storedParam, storedParams } from "./equivalents"

const GRID_SPACING = 100
const GRID_COLUMNS = 8

export type EditResult = { ok: true; circuit: Circuit; summary: string } | { ok: false; errors: CircuitError[] }

type Proposal = { candidate: unknown; summary: string } | { errors: CircuitError[] }

export function applyCommand(circuit: Circuit, command: EditCommand): EditResult {
	if (command.type === "batch") {
		let current = circuit
		for (const step of command.commands) {
			const result = applyCommand(current, step)
			if (!result.ok) return result
			current = result.circuit
		}
		return { ok: true, circuit: current, summary: command.summary }
	}
	const proposal = propose(structuredClone(circuit), command)
	if ("errors" in proposal) return { ok: false, errors: proposal.errors }

	const parsed = parseCircuit(proposal.candidate)
	return parsed.ok ? { ok: true, circuit: parsed.circuit, summary: proposal.summary } : parsed
}

function propose(draft: Circuit, command: Exclude<EditCommand, { type: "batch" }>): Proposal {
	switch (command.type) {
		case "add-component": {
			const { type } = command.component
			const given = storedParams(type, command.component.params ?? {})
			const params = { ...definitionOf(type).defaults, ...colourModel(type, given["color"]), ...given }
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
			const wire = { id: nextId(draft.wires, WIRE_PREFIX), from: command.from, to: command.to, bends: [] }
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

		case "set-parameter":
			return updateComponent(draft, command.componentId, (target) => {
				const { name, value } = storedParam(target.type, command.name, command.value)
				return {
					component: { ...target, params: { ...target.params, ...recolouredModel(target, name, value), [name]: value } },
					summary: `Set ${target.id} ${name} to ${String(value)}`,
				}
			})

		case "rename-circuit": {
			const name = command.name.trim()
			if (name === "") return { errors: [{ path: "name", message: "A circuit needs a name" }] }
			return { candidate: { ...draft, name }, summary: `Renamed the circuit "${name}"` }
		}

		case "split-wire": {
			const wire = draft.wires.find((candidate) => candidate.id === command.wireId)
			if (!wire) return notFound("wires", "wire", command.wireId)
			const id = nextComponentId(draft, "junction")
			const junction = { id, type: "junction", position: command.position, rotation: 0, params: {} }
			const middle = { componentId: id, pin: "terminal" }
			const halves = [
				{ id: wire.id, from: wire.from, to: middle, bends: [] },
				{ id: nextId(draft.wires, WIRE_PREFIX), from: middle, to: wire.to, bends: [] },
			]
			return {
				candidate: {
					...draft,
					components: [...draft.components, junction],
					wires: draft.wires.flatMap((candidate) => (candidate === wire ? halves : [candidate])),
				},
				summary: `Joined junction "${id}" into wire ${wire.id}`,
			}
		}

		case "add-note": {
			const id = command.note.id ?? nextId(draft.notes, NOTE_PREFIX)
			const note = { id, text: command.note.text, position: command.note.position ?? gridPosition(draft.notes.length) }
			return { candidate: { ...draft, notes: [...draft.notes, note] }, summary: `Added note "${shorten(note.text)}"` }
		}

		case "edit-note":
			return updateNote(draft, command.noteId, (note) => ({
				note: { ...note, text: command.text },
				summary: `Edited note "${shorten(command.text)}"`,
			}))

		case "move-note":
			return updateNote(draft, command.noteId, (note) => ({
				note: { ...note, position: command.position },
				summary: `Moved note "${shorten(note.text)}"`,
			}))

		case "remove-note": {
			const target = draft.notes.find((note) => note.id === command.noteId)
			if (!target) return notFound("notes", "note", command.noteId)
			return {
				candidate: { ...draft, notes: draft.notes.filter((note) => note !== target) },
				summary: `Removed note "${shorten(target.text)}"`,
			}
		}

		case "set-simulation": {
			const simulation = {
				...draft.simulation,
				...(command.timeStep === undefined ? {} : { timeStep: command.timeStep }),
				...(command.speed === undefined ? {} : { speed: command.speed }),
				...(command.logicHigh === undefined ? {} : { logicHigh: command.logicHigh }),
				...(command.temperature === undefined ? {} : { temperature: command.temperature }),
				...(command.stepping === undefined ? {} : { stepping: command.stepping }),
			}
			return {
				candidate: { ...draft, simulation },
				summary: `Simulation: time step ${String(simulation.timeStep)} s, speed ${String(simulation.speed)}, logic high ${String(simulation.logicHigh)} V, ${String(simulation.temperature)} °C, ${simulation.stepping} steps`,
			}
		}

		case "move-component":
			return updateComponent(
				draft,
				command.componentId,
				(target) => ({
					component: { ...target, position: command.position },
					summary: `Moved ${target.id} to (${command.position.x}, ${command.position.y})`,
				}),
				{ rerouteWires: true },
			)

		case "rotate-component":
			return updateComponent(
				draft,
				command.componentId,
				(target) => {
					const rotation = command.rotation ?? quarterTurn(target.rotation)
					return { component: { ...target, rotation }, summary: `Rotated ${target.id} to ${rotation}°` }
				},
				{ rerouteWires: true },
			)
	}
}

function updateComponent(
	draft: Circuit,
	componentId: string,
	change: (target: Component) => { component: unknown; summary: string },
	{ rerouteWires = false } = {},
): Proposal {
	const target = draft.components.find((component) => component.id === componentId)
	if (!target) return notFound("components", "component", componentId)
	const { component, summary } = change(target)
	const attached = (end: PinRef) => end.componentId === componentId
	const wires = rerouteWires
		? draft.wires.map((wire) => (attached(wire.from) || attached(wire.to) ? { ...wire, bends: [] } : wire))
		: draft.wires
	return {
		candidate: {
			...draft,
			components: draft.components.map((existing) => (existing === target ? component : existing)),
			wires,
		},
		summary,
	}
}

/** The id a new part of this type gets: its prefix and the lowest free number (R1, R2, J1…). */
export const nextComponentId = (circuit: Circuit, type: ComponentType): string => nextId(circuit.components, idPrefixOf(type))

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

/** An LED's electrical values for a colour (LED_MODELS), when the colour is a known one. */
function colourModel(type: ComponentType, colour: unknown): Partial<LedModel> {
	return type === "led" && isLedColor(colour) ? LED_MODELS[colour] : {}
}

/**
 * Recolouring an LED moves it to the new colour's model, but only while its values are still the old colour's
 * model: values the learner customised are kept.
 */
function recolouredModel(target: Component, name: string, value: unknown): Partial<LedModel> {
	if (target.type !== "led" || name !== "color" || !isLedColor(value)) return {}
	const current = LED_MODELS[target.params.color]
	const untouched = (Object.keys(current) as (keyof LedModel)[]).every((key) => target.params[key] === current[key])
	return untouched ? LED_MODELS[value] : {}
}

const isLedColor = (value: unknown): value is LedColor => LED_COLORS.some((colour) => colour === value)

const NOTE_PREFIX = "note"
const WIRE_PREFIX = "w"
/** Notes are quoted in summaries up to this many characters. */
const SUMMARY_TEXT = 40
const shorten = (text: string) => (text.length > SUMMARY_TEXT ? `${text.slice(0, SUMMARY_TEXT - 1)}…` : text)

function updateNote(
	draft: Circuit,
	noteId: string,
	change: (note: Note) => { note: Note; summary: string },
): Proposal {
	const target = draft.notes.find((note) => note.id === noteId)
	if (!target) return notFound("notes", "note", noteId)
	const { note, summary } = change(target)
	return { candidate: { ...draft, notes: draft.notes.map((existing) => (existing === target ? note : existing)) }, summary }
}

const notFound = (path: string, kind: string, id: string): Proposal => ({
	errors: [{ path, message: `No ${kind} with id "${id}"` }],
})

function quarterTurn(rotation: Component["rotation"]): Component["rotation"] {
	switch (rotation) {
		case 0:
			return 90
		case 90:
			return 180
		case 180:
			return 270
		case 270:
			return 0
	}
}
