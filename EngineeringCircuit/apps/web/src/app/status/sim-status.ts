import { Component, computed, inject } from "@angular/core"
import type { SimIssue } from "@ohmwork/engine"
import { CircuitStore } from "../circuit/circuit-store"
import { CircuitLibrary } from "../library/circuit-library"
import { formatSi } from "../circuit/si-units"

@Component({
	selector: "app-sim-status",
	templateUrl: "./sim-status.html",
	styleUrl: "./sim-status.scss",
})
export class SimStatus {
	protected readonly store = inject(CircuitStore)
	protected readonly library = inject(CircuitLibrary)

	protected readonly healthy = computed(
		() => this.store.errors().length === 0 && this.store.warnings().length === 0 && !this.store.editError(),
	)

	protected readonly time = computed(() => {
		const time = this.store.time()
		return time === undefined ? undefined : formatSi(time, "s")
	})

	protected show(issue: SimIssue): void {
		const [first] = issue.componentIds
		if (first) this.store.selection.set({ kind: "component", id: first })
	}
}
