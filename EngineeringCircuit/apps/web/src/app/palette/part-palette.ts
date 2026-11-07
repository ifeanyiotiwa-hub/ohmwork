import { Component, input, output } from "@angular/core"
import { isDcSimulated } from "@engineering-circuit/engine"
import { COMPONENT_DEFINITIONS, type ComponentType } from "@engineering-circuit/format"
import { PART_NAMES, SYMBOLS } from "../circuit/symbols"

@Component({
	selector: "app-part-palette",
	templateUrl: "./part-palette.html",
	styleUrl: "./part-palette.scss",
})
export class PartPalette {
	readonly active = input<ComponentType | undefined>(undefined)
	readonly choose = output<ComponentType>()

	protected readonly items = COMPONENT_DEFINITIONS.map((definition) => ({
		type: definition.type,
		name: PART_NAMES[definition.type],
		paths: SYMBOLS[definition.type].paths,
		marks: SYMBOLS[definition.type].marks ?? [],
		simulated: isDcSimulated(definition.type),
	}))
}
