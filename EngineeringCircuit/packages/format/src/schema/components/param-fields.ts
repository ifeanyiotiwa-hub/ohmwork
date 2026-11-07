import { z } from "zod"
import { type ComponentType, definitionOf } from "./catalog"

export type ParamField =
	| { name: string; kind: "number"; description: string; positiveOnly: boolean }
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
		return [{ name, kind: "number", description, positiveOnly: property.exclusiveMinimum === 0 }]
	})
}
