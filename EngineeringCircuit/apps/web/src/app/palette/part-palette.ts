import { Component, computed, input, output, signal } from "@angular/core"
import { isDcSimulated } from "@engineering-circuit/engine"
import { COMPONENT_CATEGORIES, type ComponentType, PIN_OFFSETS } from "@engineering-circuit/format"
import { PART_NAMES, SYMBOLS } from "../circuit/symbols"

/** Room around a symbol in its icon. */
const ICON_MARGIN = 4

/** The icon's view box: the part's body plus its pins, so tall parts (transformer, potentiometer) fit. */
function iconViewBox(type: ComponentType): string {
	const { body } = SYMBOLS[type]
	const pins = Object.values(PIN_OFFSETS[type])
	const left = Math.min(body.left, ...pins.map((pin) => pin.x)) - ICON_MARGIN
	const right = Math.max(body.right, ...pins.map((pin) => pin.x)) + ICON_MARGIN
	const top = Math.min(body.top, ...pins.map((pin) => pin.y)) - ICON_MARGIN
	const bottom = Math.max(body.bottom, ...pins.map((pin) => pin.y)) + ICON_MARGIN
	return `${left} ${top} ${right - left} ${bottom - top}`
}

const CATEGORIES = COMPONENT_CATEGORIES.map((category) => ({
	name: category.name,
	typeList: category.types.join(" "),
	items: category.types.map((type) => ({
		type,
		name: PART_NAMES[type],
		paths: SYMBOLS[type].paths,
		marks: SYMBOLS[type].marks ?? [],
		viewBox: iconViewBox(type),
		simulated: isDcSimulated(type),
	})),
}))

@Component({
	selector: "app-part-palette",
	templateUrl: "./part-palette.html",
	styleUrl: "./part-palette.scss",
})
export class PartPalette {
	readonly active = input<ComponentType | undefined>(undefined)
	readonly choose = output<ComponentType>()

	protected readonly categories = CATEGORIES
	protected readonly currentCategory = signal(CATEGORIES[0]?.name ?? "")
	protected readonly items = computed(() => CATEGORIES.find((category) => category.name === this.currentCategory())?.items ?? [])
}
