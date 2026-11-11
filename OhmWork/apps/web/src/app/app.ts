import { DOCUMENT, Component, computed, effect, inject, signal, viewChild } from "@angular/core"
import { liveSocketUrl } from "@ohmwork/editing"
import type { Circuit } from "@ohmwork/format"
import { CircuitCanvas } from "./canvas/circuit-canvas"
import { CircuitStore, type Placing, samePlacing } from "./circuit/circuit-store"
import { UI_CONFIG } from "./circuit/ui-config"
import { CURRENT_WORKSPACE, CircuitLibrary, liveWorkspaceSlot } from "./library/circuit-library"
import { LibraryPanel } from "./library/library-panel"
import { LessonsPanel } from "./lessons/lessons-panel"
import { PartInspector } from "./inspector/part-inspector"
import { PartPalette } from "./palette/part-palette"
import { PartsBrowser } from "./palette/parts-browser"
import { ScopeView } from "./scope/scope-view"
import { readRememberedFlag, rememberFlag } from "./shared/remembered-flag"
import { SimStatus } from "./status/sim-status"

const TYPING_ELEMENTS = new Set(["INPUT", "SELECT", "TEXTAREA"])

/** Remembered in the browser: the sidebar was narrowed to icons. */
const RAIL_COLLAPSED_KEY = "ohmwork.rail.collapsed"

@Component({
	selector: "app-root",
	imports: [CircuitCanvas, LessonsPanel, LibraryPanel, PartInspector, PartPalette, PartsBrowser, ScopeView, SimStatus],
	templateUrl: "./app.html",
	styleUrl: "./app.scss",
	host: { "(document:keydown)": "onKey($event)", "[class.rail-collapsed]": "railCollapsed()" },
})
export class App {
	protected readonly store = inject(CircuitStore)
	private readonly library = inject(CircuitLibrary)
	private readonly document = inject(DOCUMENT)
	private readonly config = inject(UI_CONFIG)
	private readonly libraryPanel = viewChild.required(LibraryPanel)
	private readonly lessonsPanel = viewChild.required(LessonsPanel)
	private readonly partsBrowser = viewChild.required(PartsBrowser)
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

	/** The sidebar narrowed to icons, giving the circuit its width (ADR-050). */
	protected readonly railCollapsed = signal(readRememberedFlag(RAIL_COLLAPSED_KEY))

	protected toggleRail(): void {
		const collapsed = !this.railCollapsed()
		this.railCollapsed.set(collapsed)
		rememberFlag(RAIL_COLLAPSED_KEY, collapsed)
	}

	protected openParts(): void {
		this.partsBrowser().show()
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

	/** The circuit's chips, for the palette. */
	protected readonly chips = computed(() =>
		this.store.circuit().subcircuits.map((chip) => ({ id: chip.id, name: chip.name, pins: chip.pins.map((pin) => pin.name) })),
	)

	protected choosePart(placing: Placing): void {
		this.store.wiringFrom.set(undefined)
		this.store.placing.update((current) => (samePlacing(current, placing) ? undefined : placing))
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
				b: () => this.toggleRail(),
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
