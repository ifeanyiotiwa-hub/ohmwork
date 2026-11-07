import { Component, computed, inject } from "@angular/core"
import type { SimIssue } from "@engineering-circuit/engine"
import { CircuitStore } from "../circuit/circuit-store"

@Component({
	selector: "app-sim-status",
	templateUrl: "./sim-status.html",
	styleUrl: "./sim-status.scss",
})
export class SimStatus {
	protected readonly store = inject(CircuitStore)

	protected readonly healthy = computed(
		() => this.store.errors().length === 0 && this.store.warnings().length === 0 && !this.store.editError(),
	)

	protected show(issue: SimIssue): void {
		const [first] = issue.componentIds
		if (first) this.store.selection.set({ kind: "component", id: first })
	}
}
