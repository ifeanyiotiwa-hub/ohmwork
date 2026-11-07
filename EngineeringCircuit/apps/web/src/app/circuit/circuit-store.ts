import { Injectable, computed, effect, inject, signal } from "@angular/core"
import { CircuitDocument, type EditCommand, type LiveState, applyCommand } from "@engineering-circuit/editing"
import {
	type DcResult,
	type SimIssue,
	initialTransientState,
	isTimeDependent,
	solveDc,
	stepTransient,
	wireCurrents,
} from "@engineering-circuit/engine"
import { type Circuit, type ComponentType, type PinRef, createCircuit } from "@engineering-circuit/format"
import { LiveLink } from "../live/live-link"
import { SimulationClock } from "../simulation/simulation-clock"
import { type ChangedIds, NO_CHANGES, changedIds } from "./changes"
import { kvlExample } from "./examples"
import { UI_CONFIG } from "./ui-config"

export type Selection = { kind: "component" | "wire"; id: string }

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

	newCircuit(): void {
		this.replace(createCircuit("Untitled"), "New circuit")
	}

	loadExample(): void {
		this.replace(kvlExample(), "Loaded example")
	}

	removeSelected(): void {
		const selection = this.selection()
		if (!selection) return
		const removed =
			selection.kind === "component"
				? this.apply({ type: "remove-component", componentId: selection.id })
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
		this.live.connect(socketUrl, {
			state: (state) => {
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
