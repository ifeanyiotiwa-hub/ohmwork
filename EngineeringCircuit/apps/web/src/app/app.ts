import { DOCUMENT, Component, effect, inject, signal, viewChild } from "@angular/core"
import { liveSocketUrl } from "@engineering-circuit/editing"
import type { Circuit, ComponentType } from "@engineering-circuit/format"
import { CircuitCanvas } from "./canvas/circuit-canvas"
import { CircuitStore } from "./circuit/circuit-store"
import { UI_CONFIG } from "./circuit/ui-config"
import { CircuitLibrary } from "./library/circuit-library"
import { LibraryPanel } from "./library/library-panel"
import { LessonsPanel } from "./lessons/lessons-panel"
import { PartInspector } from "./inspector/part-inspector"
import { PartPalette } from "./palette/part-palette"
import { ScopeView } from "./scope/scope-view"
import { SimStatus } from "./status/sim-status"

const TYPING_ELEMENTS = new Set(["INPUT", "SELECT", "TEXTAREA"])

@Component({
	selector: "app-root",
	imports: [CircuitCanvas, LessonsPanel, LibraryPanel, PartInspector, PartPalette, ScopeView, SimStatus],
	templateUrl: "./app.html",
	styleUrl: "./app.scss",
	host: { "(document:keydown)": "onKey($event)" },
})
export class App {
	protected readonly store = inject(CircuitStore)
	private readonly library = inject(CircuitLibrary)
	private readonly config = inject(UI_CONFIG)
	private readonly libraryPanel = viewChild.required(LibraryPanel)
	private readonly lessonsPanel = viewChild.required(LessonsPanel)
	/** Autosave starts only once the last session's circuit has been restored (or found missing). */
	private readonly restored = signal(false)

	constructor() {
		const socketUrl = liveSocketUrl(inject(DOCUMENT).location.href)
		if (socketUrl) {
			// Joined to an agent: the shared circuit is the one to show; this browser's copy is not touched.
			this.store.joinLive(socketUrl)
		} else {
			void this.restore()
		}

		effect((onCleanup) => {
			const circuit = this.store.circuit()
			if (!this.restored() || !this.library.available) return
			const timer = setTimeout(() => void this.keep(circuit), this.config.library.autosaveDelayMs)
			onCleanup(() => clearTimeout(timer))
		})
	}

	protected openLessons(): void {
		this.lessonsPanel().show()
	}

	protected openLibrary(): void {
		void this.libraryPanel().show()
	}

	private async restore(): Promise<void> {
		try {
			const last = this.library.available ? await this.library.loadWorkspace() : undefined
			if (last) this.store.replace(last, "Restored your last circuit")
		} catch (error) {
			this.reportStorage(error)
		}
		this.restored.set(true)
	}

	private async keep(circuit: Circuit): Promise<void> {
		try {
			await this.library.saveWorkspace(circuit)
			this.library.problem.set(undefined)
		} catch (error) {
			this.reportStorage(error)
		}
	}

	private reportStorage(error: unknown): void {
		const reason = error instanceof Error ? error.message : String(error)
		this.library.problem.set(`Your circuit isn't being kept in this browser (${reason}). Download it from the Library to keep it.`)
	}

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
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
			event.preventDefault()
			this.openLibrary()
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
