import { Component, DOCUMENT, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from "@angular/core"
import { isDcSimulated } from "@ohmwork/engine"
import { COMPONENT_CATEGORIES, type ComponentType, PIN_OFFSETS } from "@ohmwork/format"
import { type Placing, samePlacing } from "../circuit/circuit-store"
import { PART_NAMES, SYMBOLS, type SymbolShape, chipSymbol } from "../circuit/symbols"
import { UI_CONFIG } from "../circuit/ui-config"

/** Room around a symbol in its icon. */
const ICON_MARGIN = 4

/** The icon's view box: the part's body plus its pins, so tall parts (transformer, potentiometer) fit. */
function iconViewBox({ body }: SymbolShape, pins: readonly { x: number; y: number }[]): string {
	const left = Math.min(body.left, ...pins.map((pin) => pin.x)) - ICON_MARGIN
	const right = Math.max(body.right, ...pins.map((pin) => pin.x)) + ICON_MARGIN
	const top = Math.min(body.top, ...pins.map((pin) => pin.y)) - ICON_MARGIN
	const bottom = Math.max(body.bottom, ...pins.map((pin) => pin.y)) + ICON_MARGIN
	return `${left} ${top} ${right - left} ${bottom - top}`
}

type PaletteItem = {
	/** `data-palette`: the type, or "chip:<id>". */
	key: string
	placing: Placing
	name: string
	paths: string[]
	marks: NonNullable<SymbolShape["marks"]>
	viewBox: string
	simulated: boolean
}
type Category = { name: string; typeList: string; items: PaletteItem[] }

/** A chip in the circuit, for the Chips tab. */
export type PaletteChip = { id: string; name: string; pins: readonly string[] }

const CHIPS_CATEGORY = "Chips"

/** Browser storage key: the parts panel was pinned open (a per-browser convenience, so a missing value means unpinned). */
const PINNED_KEY = "ohmwork.parts-panel.pinned"

/** The panel keeps this far (px) from the window's bottom edge, and is never squeezed below this height (it scrolls). */
const PANEL_WINDOW_MARGIN = 12
const PANEL_MIN_HEIGHT = 200

function readPinned(): boolean {
	try {
		return localStorage.getItem(PINNED_KEY) === "true"
	} catch {
		// No storage (private window, blocked site data, prerendering): the panel starts unpinned.
		return false
	}
}

function writePinned(pinned: boolean): void {
	try {
		localStorage.setItem(PINNED_KEY, String(pinned))
	} catch {
		// Not kept: the pin still holds for this visit.
	}
}

const CATEGORIES: Category[] = COMPONENT_CATEGORIES.map((category) => ({
	name: category.name,
	typeList: category.types.join(" "),
	items: category.types.map(
		(type): PaletteItem => ({
			key: type,
			placing: type,
			name: PART_NAMES[type],
			paths: SYMBOLS[type].paths,
			marks: SYMBOLS[type].marks ?? [],
			viewBox: iconViewBox(SYMBOLS[type], Object.values(PIN_OFFSETS[type])),
			simulated: isDcSimulated(type),
		}),
	),
}))

function chipItem(chip: PaletteChip): PaletteItem {
	const symbol = chipSymbol(chip.pins)
	return {
		key: `chip:${chip.id}`,
		placing: { chip: chip.id },
		name: chip.name,
		paths: symbol.paths,
		marks: [],
		viewBox: iconViewBox(symbol, []),
		simulated: true,
	}
}

/**
 * The categories down the side and, beside them, a panel of the chosen category's parts that floats over the circuit
 * (ADR-049). The panel opens when a category is pointed at, clicked or stepped to with the arrow keys, and steps aside
 * once a part is chosen, on Escape, on a click elsewhere, or a while after the mouse leaves it. It never hides under
 * the mouse or while a part in it has the keyboard focus, and the pin keeps it open.
 */
@Component({
	selector: "app-part-palette",
	templateUrl: "./part-palette.html",
	styleUrl: "./part-palette.scss",
	host: {
		"(pointerenter)": "onPointerEnter()",
		"(pointerleave)": "onPointerLeave($event)",
		"(focusout)": "onFocusOut($event)",
		"(keydown.escape)": "hidePanel()",
		"(document:pointerdown)": "onDocumentPointerDown($event)",
	},
})
export class PartPalette {
	readonly active = input<Placing | undefined>(undefined)
	/** The circuit's own chips, shown in the Chips tab. */
	readonly chips = input<readonly PaletteChip[]>([])
	readonly choose = output<Placing>()

	protected readonly chipsCategory = CHIPS_CATEGORY
	protected readonly categories = computed<Category[]>(() => [
		...CATEGORIES,
		{ name: CHIPS_CATEGORY, typeList: "", items: this.chips().map(chipItem) },
	])
	protected readonly currentCategory = signal(CATEGORIES[0]?.name ?? "")
	protected readonly items = computed(() => this.categories().find((category) => category.name === this.currentCategory())?.items ?? [])
	protected readonly pinned = signal(readPinned())
	protected readonly panelOpen = signal(this.pinned())
	/** Height left for the panel between its top (the categories' top) and the window's bottom, measured as it opens. */
	protected readonly panelRoom = signal<number | undefined>(undefined)

	private readonly host: ElementRef<HTMLElement> = inject(ElementRef)
	private readonly injector = inject(Injector)
	private readonly document = inject(DOCUMENT)
	private readonly config = inject(UI_CONFIG)
	private readonly panel = viewChild.required<ElementRef<HTMLElement>>("panel")
	private pointerInside = false
	private idleTimer: ReturnType<typeof setTimeout> | undefined

	constructor() {
		inject(DestroyRef).onDestroy(() => this.clearIdleTimer())
		// Pinned open from the last visit: fitted to the window once it is laid out.
		afterNextRender(() => {
			if (this.panelOpen()) this.measurePanelRoom()
		})
	}

	protected isActive(item: PaletteItem): boolean {
		return samePlacing(item.placing, this.active())
	}

	/** The category holding the part being placed: marked, as the panel with its tile is usually out of sight then. */
	protected holdsActive(category: Category): boolean {
		return category.items.some((item) => this.isActive(item))
	}

	protected showCategory(name: string): void {
		this.currentCategory.set(name)
		this.measurePanelRoom()
		this.panelOpen.set(true)
		this.scheduleIdleHide()
	}

	/** Pointing at a category with a mouse opens it; a finger has no hover, so it taps instead. */
	protected onCategoryPointerEnter(event: PointerEvent, name: string): void {
		if (event.pointerType === "mouse") this.showCategory(name)
	}

	protected pick(item: PaletteItem): void {
		this.choose.emit(item.placing)
		if (!this.pinned()) this.hidePanel()
	}

	protected togglePin(): void {
		const pinned = !this.pinned()
		this.pinned.set(pinned)
		writePinned(pinned)
		this.scheduleIdleHide()
	}

	/** Hides the panel; the keyboard focus, if it was on a part, goes back to the part's category. */
	protected hidePanel(): void {
		this.clearIdleTimer()
		if (!this.panelOpen()) return
		if (this.panel().nativeElement.contains(this.document.activeElement)) this.categoryButton(this.currentCategory())?.focus()
		this.panelOpen.set(false)
	}

	protected onPointerEnter(): void {
		this.pointerInside = true
		this.clearIdleTimer()
	}

	protected onPointerLeave(event: PointerEvent): void {
		this.pointerInside = false
		// Only a mouse starts the countdown: a finger lifts off after every tap.
		if (event.pointerType === "mouse") this.scheduleIdleHide()
	}

	protected onFocusOut(event: FocusEvent): void {
		if (!(event.relatedTarget instanceof Node && this.host.nativeElement.contains(event.relatedTarget))) this.scheduleIdleHide()
	}

	/** A click or tap anywhere else (the circuit, the inspector) puts an unpinned panel away. */
	protected onDocumentPointerDown(event: PointerEvent): void {
		if (event.target instanceof Node && this.host.nativeElement.contains(event.target)) return
		if (!this.pinned()) this.hidePanel()
	}

	private measurePanelRoom(): void {
		const top = this.host.nativeElement.getBoundingClientRect().top
		this.panelRoom.set(Math.max(PANEL_MIN_HEIGHT, (this.document.defaultView?.innerHeight ?? 0) - top - PANEL_WINDOW_MARGIN))
	}

	private scheduleIdleHide(): void {
		this.clearIdleTimer()
		if (!this.panelOpen() || this.pinned() || this.pointerInside) return
		this.idleTimer = setTimeout(() => {
			this.idleTimer = undefined
			// Keyboard users keep it as long as they work in it; focusout starts the countdown again.
			if (!this.pointerInside && !this.holdsKeyboardFocus()) this.hidePanel()
		}, this.config.palette.idleHideMs)
	}

	private clearIdleTimer(): void {
		clearTimeout(this.idleTimer)
		this.idleTimer = undefined
	}

	/** Focus from the keyboard (not the focus a mouse click leaves on a button) inside the palette. */
	private holdsKeyboardFocus(): boolean {
		const focused = this.document.activeElement
		return focused instanceof HTMLElement && this.host.nativeElement.contains(focused) && focused.matches(":focus-visible")
	}

	private categoryButton(name: string): HTMLElement | null {
		return this.host.nativeElement.querySelector<HTMLElement>(`[data-category="${name}"]`)
	}

	/** Tabs keys (WAI-ARIA tabs): Up / Down (or Left / Right) go to the next category round, Home / End to the first or last. */
	protected onCategoryKey(event: KeyboardEvent, index: number): void {
		const categories = this.categories()
		const next = steppedIndex(event.key, index, categories.length)
		const category = next === undefined ? undefined : categories[next]
		if (!category) return
		event.preventDefault()
		this.showCategory(category.name)
		// After the tabs re-render, so the focused tab is already the one in the Tab order (and its parts are shown).
		afterNextRender(() => this.categoryButton(category.name)?.focus(), { injector: this.injector })
	}

	/** Left / Right (Home / End) move between the parts of the category. */
	protected onPartKey(event: KeyboardEvent, index: number): void {
		const next = steppedIndex(event.key, index, this.items().length)
		const item = next === undefined ? undefined : this.items()[next]
		if (!item) return
		event.preventDefault()
		this.host.nativeElement.querySelector<HTMLElement>(`[data-palette="${item.key}"]`)?.focus()
	}
}

/**
 * Where an arrow, Home or End key goes from `index` in a row of `count`, wrapping round; undefined for other keys. Up and
 * Down step like Left and Right, so a list works whether it runs across (a phone) or down the side.
 */
export function steppedIndex(key: string, index: number, count: number): number | undefined {
	switch (key) {
		case "ArrowRight":
		case "ArrowDown":
			return (index + 1) % count
		case "ArrowLeft":
		case "ArrowUp":
			return (index - 1 + count) % count
		case "Home":
			return 0
		case "End":
			return count - 1
		default:
			return undefined
	}
}
