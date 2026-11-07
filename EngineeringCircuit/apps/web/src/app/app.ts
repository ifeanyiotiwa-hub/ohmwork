import { Component, inject } from "@angular/core"
import type { ComponentType } from "@engineering-circuit/format"
import { CircuitCanvas } from "./canvas/circuit-canvas"
import { CircuitStore } from "./circuit/circuit-store"
import { PartInspector } from "./inspector/part-inspector"
import { PartPalette } from "./palette/part-palette"
import { SimStatus } from "./status/sim-status"

const TYPING_ELEMENTS = new Set(["INPUT", "SELECT", "TEXTAREA"])

@Component({
	selector: "app-root",
	imports: [CircuitCanvas, PartInspector, PartPalette, SimStatus],
	templateUrl: "./app.html",
	styleUrl: "./app.scss",
	host: { "(document:keydown)": "onKey($event)" },
})
export class App {
	protected readonly store = inject(CircuitStore)

	protected choosePart(type: ComponentType): void {
		this.store.wiringFrom.set(undefined)
		this.store.placing.update((current) => (current === type ? undefined : type))
	}

	protected onKey(event: KeyboardEvent): void {
		if (event.target instanceof HTMLElement && TYPING_ELEMENTS.has(event.target.tagName)) return

		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
			event.preventDefault()
			this.store.undo()
			return
		}
		switch (event.key) {
			case "Escape":
				this.store.placing.set(undefined)
				this.store.wiringFrom.set(undefined)
				this.store.selection.set(undefined)
				break
			case "Delete":
			case "Backspace":
				event.preventDefault()
				this.store.removeSelected()
				break
			case "r":
			case "R":
				this.store.rotateSelected()
				break
		}
	}
}
