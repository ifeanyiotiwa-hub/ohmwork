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
import { type Circuit, type ComponentType, type PinRef, type Point, createCircuit } from "@engineering-circuit/format"
import { LiveLink } from "../live/live-link"
import { SimulationClock } from "../simulation/simulation-clock"
import { type ChangedIds, NO_CHANGES, changedIds } from "./changes"
import { type Copied, copyParts, pasteCommand } from "./clipboard"
import { kvlExample } from "./examples"
import { UI_CONFIG } from "./ui-config"

/** How far below the lowest part a new note goes, in canvas units. */
const NOTE_GAP_BELOW = 100

export type Selection = { kind: "component" | "wire" | "note"; id: string }

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
	/** Scope probes in the circuit, in order; the oscilloscope shows one trace each. */
	readonly scopeProbes = computed(() =>
		this.circuit()
			.components.filter((component) => component.type === "scope-probe")
			.map((component) => component.id),
	)
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
	/** The group to delete, copy or move: the multi-selection, else the one selected part. */
	readonly selectedParts = computed<ReadonlySet<string>>(() => {
		const group = this.multiSelection()
		if (group.size > 0) return group
		const single = this.selectedComponent()
		return new Set(single ? [single.id] : [])
	})
	private readonly clipboard = signal<Copied | undefined>(undefined)
	readonly canPaste = computed(() => this.clipboard() !== undefined)

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
	}

	/** Starts the time simulation again from rest: capacitors empty, inductors at 0 A. */
	restartTime(): void {
		this.clock.restart()
	}

	/** Applies an edit; returns the resulting circuit, or undefined (with editError set) if it was refused. */
	apply(command: EditCommand): Circuit | undefined {
		const result = applyCommand(this.circuit(), command)
		if (!result.ok) {
			this.editError.set(result.errors.map((error) => error.message).join("\n"))
			return undefined
		}
		this.editError.set(undefined)
		if (this.shared()) {
			this.predicted.set(result.circuit)
			this.live.send({ type: "edit", command })
		} else {
			this.local.replace(result.circuit, "learner", result.summary)
			this.localRevision.update((revision) => revision + 1)
		}
		return result.circuit
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

	replace(circuit: Circuit, summary: string): void {
		this.clock.restart()
		this.selection.set(undefined)
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
		this.selection.set(undefined)
	}

	clearSelection(): void {
		this.multiSelection.set(new Set())
		this.selection.set(undefined)
	}

	copySelection(): void {
		this.clipboard.set(copyParts(this.circuit(), this.selectedParts()))
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
		const added = new Set(result.components.slice(-copied.components.length).map((component) => component.id))
		this.multiSelection.set(added)
		this.selection.set(undefined)
		// Pasting again goes further along, not on top of this copy.
		this.clipboard.set(copyParts(result, added))
	}

	/** Moves several parts by the same amount, as one change. */
	moveParts(ids: ReadonlySet<string>, delta: Point): void {
		const moves: EditCommand[] = this.circuit()
			.components.filter((component) => ids.has(component.id))
			.map((component) => ({
				type: "move-component",
				componentId: component.id,
				position: { x: component.position.x + delta.x, y: component.position.y + delta.y },
			}))
		if (moves.length === 1 && moves[0]) this.apply(moves[0])
		else if (moves.length > 1) this.apply({ type: "batch", summary: `Moved ${moves.length} parts`, commands: moves })
	}

	removeSelected(): void {
		const group = this.multiSelection()
		if (group.size > 0) {
			const removals: EditCommand[] = [...group].map((componentId) => ({ type: "remove-component", componentId }))
			if (this.apply({ type: "batch", summary: `Removed ${group.size} parts`, commands: removals })) this.clearSelection()
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

	rotateSelected(): void {
		const component = this.selectedComponent()
		if (component) this.apply({ type: "rotate-component", componentId: component.id })
	}

	press(componentId: string): void {
		this.pressed.set(new Set([componentId]))
	}

	releaseButtons(): void {
		if (this.pressed().size > 0) this.pressed.set(new Set())
	}

	/** Joins the MCP server's circuit. If the link closes, the app keeps the last shared circuit and works alone. */
	joinLive(socketUrl: string): void {
		/** The link dropped and the learner has been working on their own copy since. */
		let dropped = false
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
