import { Injectable, computed, signal } from "@angular/core"
import { CircuitDocument, type EditCommand } from "@engineering-circuit/editing"
import { type SimIssue, solveDc, wireCurrents } from "@engineering-circuit/engine"
import { type Circuit, type ComponentType, createCircuit } from "@engineering-circuit/format"
import { kvlExample } from "./examples"

export type Selection = { kind: "component" | "wire"; id: string }

@Injectable({ providedIn: "root" })
export class CircuitStore {
	private readonly document = new CircuitDocument(kvlExample())
	private readonly revision = signal(0)

	readonly circuit = computed<Circuit>(() => {
		this.revision()
		return this.document.circuit
	})
	readonly history = computed(() => {
		this.revision()
		return this.document.history
	})

	readonly result = computed(() => solveDc(this.circuit()))
	readonly solution = computed(() => {
		const result = this.result()
		return result.ok ? result.solution : undefined
	})
	readonly errors = computed<SimIssue[]>(() => {
		const result = this.result()
		return result.ok ? [] : result.errors
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
	readonly paused = signal(false)
	readonly editError = signal<string | undefined>(undefined)

	apply(command: EditCommand): boolean {
		const result = this.document.apply(command, "learner")
		if (!result.ok) {
			this.editError.set(result.errors.map((error) => error.message).join("\n"))
			return false
		}
		this.editError.set(undefined)
		this.revision.update((revision) => revision + 1)
		return true
	}

	undo(): void {
		const result = this.document.undo()
		this.editError.set(result.ok ? undefined : result.message)
		this.revision.update((revision) => revision + 1)
	}

	replace(circuit: Circuit, summary: string): void {
		this.document.replace(circuit, "learner", summary)
		this.selection.set(undefined)
		this.editError.set(undefined)
		this.revision.update((revision) => revision + 1)
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
}
