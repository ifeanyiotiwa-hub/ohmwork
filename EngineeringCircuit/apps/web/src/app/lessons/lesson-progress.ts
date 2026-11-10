import { Injectable, computed, inject, linkedSignal, signal } from "@angular/core"
import type { Circuit } from "@ohmwork/format"
import { type SolutionResult, checkSolution, lessonById } from "@ohmwork/lessons"
import { CircuitStore } from "../circuit/circuit-store"

const behaviourOf = ({ components, wires, simulation }: Circuit) => JSON.stringify({ components, wires, simulation })

/**
 * The learner's progress on the lesson of the current circuit: hints shown and the last check. Kept here, not in
 * the card, so it survives the inspector switching to a selected part and back.
 */
@Injectable({ providedIn: "root" })
export class LessonProgress {
	private readonly store = inject(CircuitStore)

	readonly lesson = computed(() => {
		const id = this.store.circuit().lesson
		return id === undefined ? undefined : lessonById(id)
	})
	/** Hints shown so far, by step; cleared when the lesson changes. */
	readonly shownHints = linkedSignal<string | undefined, ReadonlySet<number>>({
		source: () => this.lesson()?.id,
		computation: () => new Set(),
	})
	private readonly checked = signal<{ circuit: Circuit; result: SolutionResult } | undefined>(undefined)
	readonly result = computed(() => {
		const checked = this.checked()
		return checked && checked.circuit.lesson === this.store.circuit().lesson ? checked.result : undefined
	})
	/** What the circuit does changed since the last check (notes and the name don't count). */
	readonly stale = computed(() => {
		const checked = this.checked()
		return this.result() !== undefined && checked !== undefined && behaviourOf(checked.circuit) !== behaviourOf(this.store.circuit())
	})

	showHint(step: number): void {
		this.shownHints.update((shown) => new Set([...shown, step]))
	}

	check(): void {
		const lesson = this.lesson()
		if (!lesson) return
		const circuit = this.store.circuit()
		this.checked.set({ circuit, result: checkSolution(circuit, lesson) })
	}
}
