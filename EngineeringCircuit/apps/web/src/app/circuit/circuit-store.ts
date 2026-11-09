import { Injectable, computed, effect, inject, signal } from "@angular/core"
import { CircuitDocument, type EditCommand, type LiveState, applyCommand, nextComponentId } from "@engineering-circuit/editing"
import {
	type DcResult,
	type SimIssue,
	initialTransientState,
	isTimeDependent,
	solveDc,
	stepTransient,
	wireCurrents,
} from "@engineering-circuit/engine"
import { type Circuit, type Component, type ComponentType, type Note, type PinRef, type Point, createCircuit, pinsOf } from "@engineering-circuit/format"
import { LiveLink } from "../live/live-link"
import { SimulationClock } from "../simulation/simulation-clock"
import { type ChangedIds, NO_CHANGES, changedIds } from "./changes"
import { type Copied, copyParts, groupText, pasteCommand } from "./clipboard"
import { dialOf, stepValue } from "./dial"
import { kvlExample } from "./examples"
import { snap } from "./geometry"
import { UI_CONFIG } from "./ui-config"

/** How far below the lowest part a new note goes, in canvas units. */
const NOTE_GAP_BELOW = 100

export type Selection = { kind: "component" | "wire" | "note"; id: string }

/** One oscilloscope trace: a part and the two pins its voltage is measured between (first minus second). */
export type ScopeTraceSource = { id: string; pins: readonly [string, string] }

/**
 * The circuit being edited. On its own the app keeps a local CircuitDocument; joined to the live link, the
 * MCP server's document is the only copy: edits are sent there and the shared state comes back to everyone.
 */
@Injectable({ providedIn: "root" })
export class CircuitStore {
	private readonly config = inject(UI_CONFIG)
	private readonly live = inject(LiveLink)
	private readonly clock = inject(SimulationClock)
	/** A number per circuit version, so a frame from the worker is only used for the circuit it was solved for. */
	private readonly circuitIds = new WeakMap<Circuit, number>()
	private nextCircuitId = 1
	private readonly local = new CircuitDocument(kvlExample())
	private readonly localRevision = signal(0)
	private readonly shared = signal<LiveState | undefined>(undefined)
	/** Our edit as we expect the server to apply it, shown until the server answers. */
	private readonly predicted = signal<Circuit | undefined>(undefined)
	/**
	 * The learner's own copy, edited while the live link was down, which the shared circuit replaced when it came back.
	 * Offered back ("Use my version") until used or dismissed.
	 */
	readonly offlineCopy = signal<Circuit | undefined>(undefined)
	private highlightTimer: ReturnType<typeof setTimeout> | undefined

	readonly circuit = computed<Circuit>(() => {
		this.localRevision()
		return this.predicted() ?? this.shared()?.circuit ?? this.local.circuit
	})
	readonly history = computed(() => {
		this.localRevision()
		return this.shared()?.history ?? this.local.history
	})

	readonly liveStatus = this.live.status.asReadonly()
	readonly lastChange = computed(() => this.shared()?.change)
	/** What the agent just changed, highlighted briefly so the learner notices. */
	readonly agentChanges = signal<ChangedIds>(NO_CHANGES)

	/** Push buttons held down right now. Momentary, so never saved or shared over the live link. */
	readonly pressed = signal<ReadonlySet<string>>(new Set())

	/** Whether anything in the circuit changes over time (capacitors, inductors, wave sources). */
	readonly timeDependent = computed(() => isTimeDependent(this.circuit()))

	/** Plain circuits are solved here at once; time-dependent ones come from the simulation worker each frame. */
	readonly result = computed<DcResult>(() => {
		const circuit = this.circuit()
		const pressed = this.pressed()
		if (!this.timeDependent()) return solveDc(circuit, { pressed })
		const frame = this.clock.frame()
		if (frame?.circuitId === this.idOf(circuit)) return frame.result
		const first = stepTransient(circuit, initialTransientState(), { timeStep: circuit.simulation.timeStep, pressed })
		return first.ok ? { ok: true, solution: first.solution } : first
	})
	/** Simulated seconds, for time-dependent circuits. */
	readonly time = computed(() => {
		const frame = this.clock.frame()
		return this.timeDependent() && frame?.circuitId === this.idOf(this.circuit()) ? frame.time : undefined
	})
	/** Parts the learner watches on the oscilloscope without a probe; a view setting, not saved with the circuit. */
	private readonly watched = signal<readonly string[]>([])
	/**
	 * What the oscilloscope shows, one trace each: scope probes in circuit order, then watched parts still in the
	 * circuit. Each trace is the voltage from its first pin to its second.
	 */
	readonly scopeTraces = computed<ScopeTraceSource[]>(() => {
		const components = this.circuit().components
		const probes = components.filter((component) => component.type === "scope-probe")
		const watched = this.watched().flatMap((id) => {
			const part = components.find((component) => component.id === id)
			const [first, second] = part ? pinsOf(part.type) : []
			return part && part.type !== "scope-probe" && first && second ? [{ id, pins: [first, second] as const }] : []
		})
		return [...probes.map((probe) => ({ id: probe.id, pins: ["positive", "negative"] as const })), ...watched]
	})
	readonly scopeSamples = this.clock.samples.asReadonly()

	readonly slowed = computed(() => this.time() !== undefined && this.clock.frame()?.slowed === true)
	readonly solution = computed(() => {
		const result = this.result()
		return result.ok ? result.solution : undefined
	})
	readonly errors = computed<SimIssue[]>(() => {
		const result = this.result()
		const failure = this.clock.failure()
		return [...(result.ok ? [] : result.errors), ...(failure ? [{ componentIds: [], message: failure }] : [])]
	})
	readonly warnings = computed<SimIssue[]>(() => this.solution()?.warnings ?? [])
	readonly wireCurrents = computed<Record<string, number>>(() => {
		const solution = this.solution()
		return solution ? wireCurrents(this.circuit(), solution) : {}
	})

	readonly selection = signal<Selection | undefined>(undefined)
	readonly selectedComponent = computed(() => {
		const selection = this.selection()
		return selection?.kind === "component"
			? this.circuit().components.find((component) => component.id === selection.id)
			: undefined
	})
	readonly selectedWire = computed(() => {
		const selection = this.selection()
		return selection?.kind === "wire" ? this.circuit().wires.find((wire) => wire.id === selection.id) : undefined
	})

	readonly selectedNote = computed(() => {
		const selection = this.selection()
		return selection?.kind === "note" ? this.circuit().notes.find((note) => note.id === selection.id) : undefined
	})

	/** Parts chosen together (Shift-click, box or Ctrl/⌘+A), acted on as a group. */
	readonly multiSelection = signal<ReadonlySet<string>>(new Set())
	/** Notes in the group (box select, select all, paste), moved, copied and deleted with its parts. */
	readonly multiNotes = signal<ReadonlySet<string>>(new Set())
	/** The group to delete, copy or move: the multi-selection, else the one selected part. */
	readonly selectedParts = computed<ReadonlySet<string>>(() => {
		const group = this.multiSelection()
		if (group.size > 0) return group
		const single = this.selectedComponent()
		return new Set(single ? [single.id] : [])
	})
	private readonly clipboard = signal<Copied | undefined>(undefined)
	readonly canPaste = computed(() => this.clipboard() !== undefined)
	/** The last dial step from a click, wheel or key, to tell whether the next one continues the same turn. */
	private lastNudge: { componentId: string; gesture: string; at: number } | undefined

	readonly placing = signal<ComponentType | undefined>(undefined)
	readonly wiringFrom = signal<PinRef | undefined>(undefined)
	readonly paused = signal(false)
	readonly editError = signal<string | undefined>(undefined)

	constructor() {
		effect(() => {
			const circuit = this.circuit()
			this.clock.load(this.timeDependent() ? circuit : undefined, this.idOf(circuit))
		})
		effect(() => this.clock.press([...this.pressed()]))
		effect(() => this.clock.setRunning(!this.paused()))
		effect(() => {
			const watching = new Set(this.watched())
			this.clock.watch(this.scopeTraces().flatMap((trace) => (watching.has(trace.id) ? [trace.id] : [])))
		})
	}

	/** Shows a part's voltage on the oscilloscope, or stops showing it. */
	toggleWatch(id: string): void {
		this.watched.update((ids) => (ids.includes(id) ? ids.filter((watched) => watched !== id) : [...ids, id]))
	}

	isWatched(id: string): boolean {
		return this.scopeTraces().some((trace) => trace.id === id) && this.watched().includes(id)
	}

	/** Starts the time simulation again from rest: capacitors empty, inductors at 0 A. */
	restartTime(): void {
		this.clock.restart()
	}

	/**
	 * Applies an edit; returns the resulting circuit, or undefined (with editError set) if it was refused. Edits sharing a
	 * `gesture` (one turn of a value dial) are one undo step.
	 */
	apply(command: EditCommand, { gesture }: { gesture?: string } = {}): Circuit | undefined {
		const result = applyCommand(this.circuit(), command)
		if (!result.ok) {
			this.editError.set(result.errors.map((error) => error.message).join("\n"))
			return undefined
		}
		this.editError.set(undefined)
		if (this.shared()) {
			this.predicted.set(result.circuit)
			this.live.send({ type: "edit", command, ...(gesture === undefined ? {} : { gesture }) })
		} else {
			this.local.replace(result.circuit, "learner", result.summary, gesture === undefined ? {} : { gesture })
			this.localRevision.update((revision) => revision + 1)
		}
		return result.circuit
	}

	/** Turns a part's value dial one step up or down; all the steps of one turn (`gesture`) are one undo step. */
	turnDial(componentId: string, direction: 1 | -1, gesture: string): void {
		const part = this.circuit().components.find((component) => component.id === componentId)
		const dial = part ? dialOf(part.type) : undefined
		if (!part || !dial) return
		const value = (part.params as Readonly<Record<string, unknown>>)[dial.param]
		if (typeof value !== "number") return
		const next = stepValue(dial, value, direction)
		if (next === value) return
		this.apply({ type: "set-parameter", componentId, name: dial.param, value: next }, { gesture })
	}

	/**
	 * One step of the dial from a click, a wheel notch or a key. Steps on the same part closer together than
	 * `dial.turnIdleMs` count as one turn, so a burst of clicks is one undo step.
	 */
	nudgeDial(componentId: string, direction: 1 | -1): void {
		const now = Date.now()
		const last = this.lastNudge
		const sameTurn = last?.componentId === componentId && now - last.at < this.config.dial.turnIdleMs
		const gesture = sameTurn ? last.gesture : `nudge-${componentId}-${now}`
		this.lastNudge = { componentId, gesture, at: now }
		this.turnDial(componentId, direction, gesture)
	}
	undo(): void {
		if (this.shared()) {
			this.live.send({ type: "undo" })
			return
		}
		const result = this.local.undo("learner")
		this.editError.set(result.ok ? undefined : result.message)
		this.localRevision.update((revision) => revision + 1)
	}

	redo(): void {
		if (this.shared()) {
			this.live.send({ type: "redo" })
			return
		}
		const result = this.local.redo("learner")
		this.editError.set(result.ok ? undefined : result.message)
		this.localRevision.update((revision) => revision + 1)
	}

	replace(circuit: Circuit, summary: string): void {
		this.clock.restart()
		this.selection.set(undefined)
		// A different circuit: what was watched belonged to the old one.
		this.watched.set([])
		this.editError.set(undefined)
		if (this.shared()) {
			this.predicted.set(circuit)
			this.live.send({ type: "replace", circuit, summary })
			return
		}
		this.local.replace(circuit, "learner", summary)
		this.localRevision.update((revision) => revision + 1)
	}

	/** Finishes a wire on another wire: a junction goes into that wire at `at`, and the new wire joins it. */
	joinWire(from: PinRef, wireId: string, at: Point): void {
		const junctionId = nextComponentId(this.circuit(), "junction")
		this.apply({
			type: "batch",
			summary: `Joined ${from.componentId}.${from.pin} to wire ${wireId}`,
			commands: [
				{ type: "split-wire", wireId, position: at },
				{ type: "connect", from, to: { componentId: junctionId, pin: "terminal" } },
			],
		})
	}

	/** Adds a note just below the circuit and selects it, ready for its text to be edited. */
	addNote(text: string): void {
		const parts = this.circuit().components
		const position =
			parts.length === 0
				? { x: 0, y: 0 }
				: {
						x: Math.min(...parts.map((part) => part.position.x)),
						y: Math.max(...parts.map((part) => part.position.y)) + NOTE_GAP_BELOW,
					}
		const result = this.apply({ type: "add-note", note: { text, position } })
		const added = result?.notes.at(-1)
		if (added) this.selection.set({ kind: "note", id: added.id })
	}

	newCircuit(): void {
		this.replace(createCircuit("Untitled"), "New circuit")
	}

	loadExample(): void {
		this.replace(kvlExample(), "Loaded example")
	}

	/** Shift-click: adds a part to the group, or takes it out (the single selection joins the group first). */
	toggleInSelection(id: string): void {
		const group = new Set(this.selectedParts())
		if (group.has(id)) group.delete(id)
		else group.add(id)
		this.multiSelection.set(group)
		this.selection.set(undefined)
	}

	selectAll(): void {
		this.multiSelection.set(new Set(this.circuit().components.map((component) => component.id)))
		this.multiNotes.set(new Set(this.circuit().notes.map((note) => note.id)))
		this.selection.set(undefined)
	}

	clearSelection(): void {
		this.multiSelection.set(new Set())
		this.multiNotes.set(new Set())
		this.selection.set(undefined)
	}

	/** The notes to copy: the group's, else the one selected note. */
	private selectedNoteIds(): ReadonlySet<string> {
		if (this.multiNotes().size > 0) return this.multiNotes()
		const selection = this.selection()
		return new Set(selection?.kind === "note" ? [selection.id] : [])
	}

	copySelection(): void {
		this.clipboard.set(copyParts(this.circuit(), this.selectedParts(), this.selectedNoteIds()))
	}

	/** Pastes the copied parts two grid squares down and right, and selects them. */
	paste(): void {
		const copied = this.clipboard()
		if (!copied) return
		const step = 2 * this.config.gridSize
		const command = pasteCommand(this.circuit(), copied, { x: step, y: step })
		if (!command) return
		const result = this.apply(command)
		if (!result) return
		const added = new Set(copied.components.length === 0 ? [] : result.components.slice(-copied.components.length).map((component) => component.id))
		const addedNotes = new Set(copied.notes.length === 0 ? [] : result.notes.slice(-copied.notes.length).map((note) => note.id))
		this.multiSelection.set(added)
		this.multiNotes.set(addedNotes)
		this.selection.set(undefined)
		// Pasting again goes further along, not on top of this copy.
		this.clipboard.set(copyParts(result, added, addedNotes))
	}

	/** Moves several parts (and notes) by the same amount, as one change. */
	moveParts(ids: ReadonlySet<string>, delta: Point, noteIds: ReadonlySet<string> = new Set()): void {
		const shifted = (at: Point) => ({ x: at.x + delta.x, y: at.y + delta.y })
		const parts: EditCommand[] = this.circuit()
			.components.filter((component) => ids.has(component.id))
			.map((component) => ({ type: "move-component", componentId: component.id, position: shifted(component.position) }))
		const notes: EditCommand[] = this.circuit()
			.notes.filter((note) => noteIds.has(note.id))
			.map((note) => ({ type: "move-note", noteId: note.id, position: shifted(note.position) }))
		const moves = [...parts, ...notes]
		if (moves.length === 1 && moves[0]) this.apply(moves[0])
		else if (moves.length > 1) this.apply({ type: "batch", summary: `Moved ${groupText(parts.length, notes.length)}`, commands: moves })
	}

	removeSelected(): void {
		const group = this.multiSelection()
		const notes = this.multiNotes()
		if (group.size > 0 || notes.size > 0) {
			const removals: EditCommand[] = [
				...[...group].map((componentId): EditCommand => ({ type: "remove-component", componentId })),
				...[...notes].map((noteId): EditCommand => ({ type: "remove-note", noteId })),
			]
			if (this.apply({ type: "batch", summary: `Removed ${groupText(group.size, notes.size)}`, commands: removals })) this.clearSelection()
			return
		}
		const selection = this.selection()
		if (!selection) return
		const removed =
			selection.kind === "component"
				? this.apply({ type: "remove-component", componentId: selection.id })
				: selection.kind === "note"
					? this.apply({ type: "remove-note", noteId: selection.id })
					: this.apply({ type: "disconnect", wireId: selection.id })
		if (removed) this.selection.set(undefined)
	}

	/** R: the selected part turns a quarter turn clockwise; a group turns about its middle. */
	rotateSelected(): void {
		const parts = this.circuit().components.filter((component) => this.multiSelection().has(component.id))
		const notes = this.circuit().notes.filter((note) => this.multiNotes().has(note.id))
		if (parts.length + notes.length > 1) {
			this.rotateGroup(parts, notes)
			return
		}
		const component = this.selectedComponent() ?? parts[0]
		if (component) this.apply({ type: "rotate-component", componentId: component.id })
	}

	/**
	 * Each part moves a quarter turn clockwise about the group's middle (on the grid, so parts stay on grid points) and
	 * turns itself; notes move but stay upright.
	 */
	private rotateGroup(parts: readonly Component[], notes: readonly Note[]): void {
		const positions = [...parts.map((part) => part.position), ...notes.map((note) => note.position)]
		const grid = this.config.gridSize
		const xs = positions.map((point) => point.x)
		const ys = positions.map((point) => point.y)
		const middle = { x: snap((Math.min(...xs) + Math.max(...xs)) / 2, grid), y: snap((Math.min(...ys) + Math.max(...ys)) / 2, grid) }
		// Clockwise on screen (y grows down): (dx, dy) → (−dy, dx).
		const turned = ({ x, y }: Point) => ({ x: middle.x - (y - middle.y), y: middle.y + (x - middle.x) })
		const commands: EditCommand[] = [
			...parts.flatMap((part): EditCommand[] => [
				{ type: "move-component", componentId: part.id, position: turned(part.position) },
				{ type: "rotate-component", componentId: part.id },
			]),
			...notes.map((note): EditCommand => ({ type: "move-note", noteId: note.id, position: turned(note.position) })),
		]
		this.apply({ type: "batch", summary: `Rotated ${groupText(parts.length, notes.length)}`, commands })
	}

	press(componentId: string): void {
		this.pressed.set(new Set([componentId]))
	}

	releaseButtons(): void {
		if (this.pressed().size > 0) this.pressed.set(new Set())
	}

	/** Sends the learner's offline copy to the shared circuit, replacing it (one change the agent sees and can undo). */
	useOfflineCopy(): void {
		const mine = this.offlineCopy()
		this.offlineCopy.set(undefined)
		if (!mine || !this.shared()) return
		this.predicted.set(mine)
		this.live.send({ type: "replace", circuit: mine, summary: "Used the learner's offline changes" })
	}

	dismissOfflineCopy(): void {
		this.offlineCopy.set(undefined)
	}

	/** Tries the live link again now, instead of waiting for the next retry (or after it gave up). */
	reconnectLive(): void {
		this.live.reconnectNow()
	}

	/** Joins the MCP server's circuit. If the link closes, the app keeps the last shared circuit and works alone. */
	/**
	 * Shows the agent's shared circuit. With `keepLocal`, the circuit already shown is the learner's own copy from this
	 * session (restored after a reload), so a server that comes back empty is given it instead of wiping it.
	 */
	joinLive(socketUrl: string, { keepLocal = false }: { keepLocal?: boolean } = {}): void {
		/** The learner has been working on their own copy (the link dropped, or the copy was restored). */
		let dropped = keepLocal
		this.live.connect(socketUrl, {
			state: (state) => {
				if (dropped) {
					dropped = false
					// A restarted server starts empty: send it the learner's circuit rather than lose it.
					const restarted = state.revision === 0 && state.circuit.components.length === 0
					const mine = this.local.circuit
					if (restarted && mine.components.length > 0) {
						this.shared.set(state)
						this.predicted.set(mine)
						this.live.send({ type: "replace", circuit: mine, summary: "Kept the learner's circuit after reconnecting" })
						return
					}
					// Otherwise the shared circuit wins; if the learner's copy differs, say so and keep it on offer.
					if (JSON.stringify(mine) !== JSON.stringify(state.circuit)) this.offlineCopy.set(mine)
				}
				const before = this.shared()?.circuit
				this.predicted.set(undefined)
				this.shared.set(state)
				if (before && state.change?.author === "agent") this.highlight(changedIds(before, state.circuit))
			},
			rejected: (message) => {
				this.predicted.set(undefined)
				this.editError.set(message)
			},
			closed: () => {
				const last = this.shared()
				this.predicted.set(undefined)
				this.shared.set(undefined)
				if (!last) return
				dropped = true
				this.local.replace(last.circuit, "learner", "Kept the circuit from the closed live link")
				this.localRevision.update((revision) => revision + 1)
			},
		})
	}

	private idOf(circuit: Circuit): number {
		let id = this.circuitIds.get(circuit)
		if (id === undefined) {
			id = this.nextCircuitId++
			this.circuitIds.set(circuit, id)
		}
		return id
	}

	private highlight(changes: ChangedIds): void {
		clearTimeout(this.highlightTimer)
		this.agentChanges.set(changes)
		this.highlightTimer = setTimeout(() => this.agentChanges.set(NO_CHANGES), this.config.agentHighlightMs)
	}
}
