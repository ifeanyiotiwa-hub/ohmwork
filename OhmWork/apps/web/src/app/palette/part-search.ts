import { isDcSimulated } from "@ohmwork/engine"
import { COMPONENT_CATEGORIES, type ComponentType, paramFieldsOf, pinsOf } from "@ohmwork/format"
import { PART_NAMES } from "../circuit/symbols"

export type ListedPart = {
	type: ComponentType
	name: string
	category: string
	pins: readonly string[]
	/** Parameter names, as shown. */
	params: string[]
	/** Their descriptions too, searched but not shown. */
	paramText: string
	simulated: boolean
}

/** Every part of the catalog, in palette order (chips are each circuit's own, in the palette's Chips tab). */
export const PART_LIST: readonly ListedPart[] = COMPONENT_CATEGORIES.flatMap((category) =>
	category.types.map((type) => ({
		type,
		name: PART_NAMES[type],
		category: category.name,
		pins: pinsOf(type),
		params: paramFieldsOf(type).map((field) => field.name),
		paramText: paramFieldsOf(type)
			.map((field) => `${field.name} ${field.description}`)
			.join(" "),
		simulated: isDcSimulated(type),
	})),
)

const words = (text: string) => text.toLowerCase().split(/[\s-]+/).filter(Boolean)

/**
 * The parts matching every word of the query, in name, type, category, pins or parameters (capitals ignored), those
 * whose name has every word first; an empty query lists them all.
 */
export function searchParts(query: string): ListedPart[] {
	const wanted = words(query)
	if (wanted.length === 0) return [...PART_LIST]
	const has = (text: string) => wanted.every((word) => text.toLowerCase().includes(word))
	const matching = PART_LIST.filter((part) => has([part.name, part.type, part.category, ...part.pins, part.paramText].join(" ")))
	const byName = matching.filter((part) => has(`${part.name} ${part.type}`))
	return [...byName, ...matching.filter((part) => !byName.includes(part))]
}

/** What to tell the agent for a part the app lacks: draft it from datasheets, and save it for review (MCP tools). */
export function partRequestPrompt(request: string): string {
	return [
		`Please draft a new part for OhmWork: ${request.trim()}.`,
		"Use part_request_guide first, take every value from a datasheet or a manufacturer's SPICE model and list it as a source,",
		"then save it with save_part_request so it can be reviewed before it is added.",
	].join(" ")
}
