import { type Component, paramFieldsOf } from "@engineering-circuit/format"
import { formatSi, unitSymbolOf } from "./si-units"

export function valueText(component: Component): string {
	const params: Record<string, unknown> = component.params
	return paramFieldsOf(component.type)
		.map((field) => {
			const value = params[field.name]
			if (field.kind === "number" && typeof value === "number") return formatSi(value, unitSymbolOf(field.description))
			if (field.kind === "boolean") return value === true ? "closed" : "open"
			return String(value)
		})
		.join(" ")
}
