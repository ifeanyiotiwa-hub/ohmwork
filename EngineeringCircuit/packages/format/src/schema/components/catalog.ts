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
