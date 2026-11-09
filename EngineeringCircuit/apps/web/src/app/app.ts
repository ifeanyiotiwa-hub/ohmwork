import { DOCUMENT, Component, effect, inject, signal, viewChild } from "@angular/core"
import { liveSocketUrl } from "@engineering-circuit/editing"
import type { Circuit, ComponentType } from "@engineering-circuit/format"
import { CircuitCanvas } from "./canvas/circuit-canvas"
import { CircuitStore } from "./circuit/circuit-store"
import { UI_CONFIG } from "./circuit/ui-config"
import { CURRENT_WORKSPACE, CircuitLibrary, liveWorkspaceSlot } from "./library/circuit-library"
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
	private readonly document = inject(DOCUMENT)
	private readonly config = inject(UI_CONFIG)
	private readonly libraryPanel = viewChild.required(LibraryPanel)
	private readonly lessonsPanel = viewChild.required(LessonsPanel)
	/** Autosave starts only once the last session's circuit has been restored (or found missing). */
	private readonly restored = signal(false)
	/**
	 * Where the circuit is kept: the learner's own workspace, or, when joined to an agent, that session's own slot, so
	 * a live session never overwrites the learner's circuit and its work survives a reload after the agent has gone.
	 */
	private readonly slot: string

	constructor() {
		const socketUrl = liveSocketUrl(this.document.location.href)
		this.slot = socketUrl ? liveWorkspaceSlot(socketUrl) : CURRENT_WORKSPACE
		void this.restore().then((found) => {
			if (socketUrl) this.store.joinLive(socketUrl, { keepLocal: found })
		})

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

	/** Restores the circuit kept in this slot; true when there was one. */
	private async restore(): Promise<boolean> {
		let found = false
		try {
			if (this.library.available) await this.library.loadDamaged()
			const last = this.library.available ? await this.library.loadWorkspace(this.slot) : undefined
			if (last?.kind === "found") {
				this.store.replace(last.circuit, "Restored your last circuit")
				found = true
			}
		} catch (error) {
			this.reportStorage(error)
		}
		this.restored.set(true)
		return found
	}

	private async keep(circuit: Circuit): Promise<void> {
		try {
			await this.library.saveWorkspace(circuit, this.slot)
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

	/**
	 * Canvas shortcuts. They don't act while typing or while a dialog is open (the circuit is behind it), and keys
	 * the canvas doesn't use, with Ctrl/⌘/Alt held, are left to the browser (Ctrl/⌘+R reloads, it doesn't rotate).
	 */
	protected onKey(event: KeyboardEvent): void {
		if (event.target instanceof HTMLElement && TYPING_ELEMENTS.has(event.target.tagName)) return
		if (this.document.querySelector("dialog[open]")) return

		if (event.metaKey || event.ctrlKey) {
			// Ctrl/⌘ + key.
			const shortcuts: Readonly<Record<string, () => void>> = {
				// Ctrl/⌘+Shift+Z redoes (macOS and most apps); Ctrl+Y too (Windows).
				z: () => (event.shiftKey ? this.store.redo() : this.store.undo()),
				y: () => this.store.redo(),
				s: () => this.openLibrary(),
				a: () => this.store.selectAll(),
				c: () => this.store.copySelection(),
				v: () => this.store.paste(),
			}
			const key = event.key.toLowerCase()
			// With text selected on the page, Ctrl/⌘+C copies that text, as everywhere else.
			const copyingText = key === "c" && (this.document.getSelection()?.toString() ?? "") !== ""
			const action = shortcuts[key]
			if (action && !copyingText) {
				event.preventDefault()
				action()
			}
			return
		}
		if (event.altKey) return
		switch (event.key) {
			case "Escape":
				this.store.placing.set(undefined)
				this.store.wiringFrom.set(undefined)
				this.store.clearSelection()
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
			case "+":
			case "=":
			case "-":
			case "_": {
				const part = this.store.selectedComponent()
				if (part) this.store.nudgeDial(part.id, event.key === "+" || event.key === "=" ? 1 : -1)
				break
			}
		}
	}
}
