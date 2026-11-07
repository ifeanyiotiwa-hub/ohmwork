import { z } from "zod"
import { MEASUREMENT } from "./measurement"
import { PASSIVES } from "./passives"
import { SEMICONDUCTORS } from "./semiconductors"
import { SOURCES } from "./sources"
import { SWITCHES } from "./switches"

export const COMPONENT_DEFINITIONS = [...SOURCES, ...PASSIVES, ...SWITCHES, ...SEMICONDUCTORS, ...MEASUREMENT] as const

/** The category files, in palette order. */
export const COMPONENT_CATEGORIES: readonly { name: string; types: readonly ComponentType[] }[] = [
	{ name: "Sources", types: SOURCES.map((definition) => definition.type) },
	{ name: "Passive", types: PASSIVES.map((definition) => definition.type) },
	{ name: "Switches", types: SWITCHES.map((definition) => definition.type) },
	{ name: "Semiconductors", types: SEMICONDUCTORS.map((definition) => definition.type) },
	{ name: "Meters", types: MEASUREMENT.map((definition) => definition.type) },
]

type SchemasOf<Definitions extends readonly { schema: unknown }[]> = {
	[Index in keyof Definitions]: Definitions[Index]["schema"]
}

const schemasOf = <Definitions extends readonly { schema: unknown }[]>(definitions: Definitions) =>
	definitions.map((definition) => definition.schema) as SchemasOf<Definitions>

export const componentSchema = z.discriminatedUnion("type", schemasOf(COMPONENT_DEFINITIONS))
export type Component = z.infer<typeof componentSchema>
export type ComponentType = Component["type"]

export type ComponentDefinition = (typeof COMPONENT_DEFINITIONS)[number]

const DEFINITIONS_BY_TYPE: ReadonlyMap<string, ComponentDefinition> = new Map(
	COMPONENT_DEFINITIONS.map((definition) => [definition.type, definition]),
)

export const isComponentType = (value: unknown): value is ComponentType =>
	typeof value === "string" && DEFINITIONS_BY_TYPE.has(value)

export function definitionOf(type: ComponentType): ComponentDefinition {
	const definition = DEFINITIONS_BY_TYPE.get(type)
	if (!definition) throw new Error(`No definition for component type "${type}"`)
	return definition
}

export const pinsOf = (type: ComponentType): readonly string[] => definitionOf(type).pins

export const idPrefixOf = (type: ComponentType): string => definitionOf(type).idPrefix
