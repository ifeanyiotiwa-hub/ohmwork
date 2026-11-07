import { z } from "zod"
import { type ComponentType, definitionOf } from "./catalog"

export type ParamField =
	| { name: string; kind: "number"; description: string; positiveOnly: boolean; range?: { min: number; max: number } }
	| { name: string; kind: "boolean"; description: string }
	| { name: string; kind: "choice"; description: string; options: string[] }

export function paramFieldsOf(type: ComponentType): ParamField[] {
	const schema = z.toJSONSchema(definitionOf(type).schema.shape.params)

	return Object.entries(schema.properties ?? {}).flatMap(([name, property]): ParamField[] => {
		if (typeof property !== "object") return []
		const description = property.description ?? ""
		if (Array.isArray(property.enum)) {
			return [{ name, kind: "choice", description, options: property.enum.map(String) }]
		}
		if (property.type === "boolean") return [{ name, kind: "boolean", description }]
		const { minimum, maximum } = property
		const field = { name, kind: "number" as const, description, positiveOnly: property.exclusiveMinimum === 0 }
		return [typeof minimum === "number" && typeof maximum === "number" ? { ...field, range: { min: minimum, max: maximum } } : field]
	})
}
