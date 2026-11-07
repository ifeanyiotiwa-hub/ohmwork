import { z } from "zod"
import { PASSIVES } from "./passives"
import { SEMICONDUCTORS } from "./semiconductors"
import { SOURCES } from "./sources"
import { SWITCHES } from "./switches"

export const COMPONENT_DEFINITIONS = [...SOURCES, ...PASSIVES, ...SWITCHES, ...SEMICONDUCTORS] as const

type SchemasOf<Definitions extends readonly { schema: unknown }[]> = {
	[Index in keyof Definitions]: Definitions[Index]["schema"]
}

const schemasOf = <Definitions extends readonly { schema: unknown }[]>(definitions: Definitions) =>
	definitions.map((definition) => definition.schema) as SchemasOf<Definitions>

export const componentSchema = z.discriminatedUnion("type", schemasOf(COMPONENT_DEFINITIONS))
export type Component = z.infer<typeof componentSchema>
export type ComponentType = Component["type"]

const PINS_BY_TYPE: ReadonlyMap<string, readonly string[]> = new Map(
	COMPONENT_DEFINITIONS.map((definition) => [definition.type, definition.pins]),
)

export const isComponentType = (value: unknown): value is ComponentType =>
	typeof value === "string" && PINS_BY_TYPE.has(value)

export function pinsOf(type: ComponentType): readonly string[] {
	const pins = PINS_BY_TYPE.get(type)
	if (!pins) throw new Error(`No pins defined for component type "${type}"`)
	return pins
}
