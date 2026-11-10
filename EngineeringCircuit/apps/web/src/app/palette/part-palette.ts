import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal } from "@angular/core"
import { isDcSimulated } from "@ohmwork/engine"
import { COMPONENT_CATEGORIES, type ComponentType, PIN_OFFSETS } from "@ohmwork/format"
import { type Placing, samePlacing } from "../circuit/circuit-store"
import { PART_NAMES, SYMBOLS, type SymbolShape, chipSymbol } from "../circuit/symbols"

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

@Component({
	selector: "app-part-palette",
	templateUrl: "./part-palette.html",
	styleUrl: "./part-palette.scss",
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

	protected isActive(item: PaletteItem): boolean {
		return samePlacing(item.placing, this.active())
	}
	private readonly host: ElementRef<HTMLElement> = inject(ElementRef)
	private readonly injector = inject(Injector)

	/** Tabs keys (WAI-ARIA tabs): Left / Right go to the next category round, Home / End to the first or last. */
	protected onCategoryKey(event: KeyboardEvent, index: number): void {
		const categories = this.categories()
		const next = steppedIndex(event.key, index, categories.length)
		const category = next === undefined ? undefined : categories[next]
		if (!category) return
		event.preventDefault()
		this.currentCategory.set(category.name)
		// After the tabs re-render, so the focused tab is already the one in the Tab order (and its parts are shown).
		afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-category="${category.name}"]`)?.focus(), {
			injector: this.injector,
		})
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

/** Where an arrow, Home or End key goes from `index` in a row of `count`, wrapping round; undefined for other keys. */
export function steppedIndex(key: string, index: number, count: number): number | undefined {
	switch (key) {
		case "ArrowRight":
			return (index + 1) % count
		case "ArrowLeft":
			return (index - 1 + count) % count
		case "Home":
			return 0
		case "End":
			return count - 1
		default:
			return undefined
	}
}
