import type { z } from "zod"
import { type Circuit, CURRENT_VERSION, FORMAT_ID, circuitSchema } from "../schema/circuit"
import { isComponentType, pinsOf } from "../schema/components/catalog"
import { type JsonObject, isObject, migrate } from "./migrations"

export type CircuitError = { path: string; message: string }
export type ParseResult = { ok: true; circuit: Circuit } | { ok: false; errors: CircuitError[] }

const failure = (path: string, message: string): ParseResult => ({ ok: false, errors: [{ path, message }] })

export function parseCircuitJson(text: string): ParseResult {
	try {
		return parseCircuit(JSON.parse(text))
	} catch (error) {
		return failure("", `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
	}
}

export const serializeCircuit = (circuit: Circuit): string => JSON.stringify(circuit, null, 2)

export function parseCircuit(input: unknown): ParseResult {
	if (!isObject(input) || input.format !== FORMAT_ID) {
		return failure("format", `Not an ${FORMAT_ID} file`)
	}

	const version = input.version
	if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
		return failure("version", "Version must be a positive whole number")
	}
	if (version > CURRENT_VERSION) {
		return failure("version", `File is version ${version}; this app supports up to ${CURRENT_VERSION}. Update the app.`)
	}

	const migrated = migrate(input, version, CURRENT_VERSION)
	if (!migrated.ok) return failure("version", migrated.message)

	const unknownTypes = findUnknownTypes(migrated.document)
	if (unknownTypes.length > 0) return { ok: false, errors: unknownTypes }

	const parsed = circuitSchema.safeParse(migrated.document)
	if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(toCircuitError) }

	const errors = findReferenceErrors(parsed.data)
	return errors.length > 0 ? { ok: false, errors } : { ok: true, circuit: parsed.data }
}

function findUnknownTypes(document: JsonObject): CircuitError[] {
	const components = document.components
	if (!Array.isArray(components)) return []

	return components.flatMap((component: unknown, index) => {
		if (!isObject(component) || typeof component.type !== "string" || isComponentType(component.type)) return []
		return [
			{
				path: `components[${index}].type`,
				message: `Unknown component type "${component.type}". It may come from a newer version; update the app.`,
			},
		]
	})
}

function toCircuitError(issue: z.core.$ZodIssue): CircuitError {
	return { path: formatPath(issue.path), message: issue.message }
}

function formatPath(path: readonly PropertyKey[]): string {
	return path
		.map((key, index) => (typeof key === "number" ? `[${key}]` : `${index === 0 ? "" : "."}${String(key)}`))
		.join("")
}

function findReferenceErrors(circuit: Circuit): CircuitError[] {
	const errors: CircuitError[] = []
	const componentsById = new Map(circuit.components.map((component) => [component.id, component]))

	duplicates(circuit.components.map((component) => component.id)).forEach((id) =>
		errors.push({ path: "components", message: `Duplicate component id "${id}"` }),
	)
	duplicates(circuit.wires.map((wire) => wire.id)).forEach((id) =>
		errors.push({ path: "wires", message: `Duplicate wire id "${id}"` }),
	)

	circuit.wires.forEach((wire, index) => {
		for (const end of ["from", "to"] as const) {
			const ref = wire[end]
			const path = `wires[${index}].${end}`
			const component = componentsById.get(ref.componentId)
			if (!component) {
				errors.push({ path, message: `Unknown component "${ref.componentId}"` })
			} else if (!pinsOf(component.type).includes(ref.pin)) {
				const valid = pinsOf(component.type).join(", ")
				errors.push({ path, message: `${component.type} has no pin "${ref.pin}" (valid: ${valid})` })
			}
		}
		if (wire.from.componentId === wire.to.componentId && wire.from.pin === wire.to.pin) {
			errors.push({ path: `wires[${index}]`, message: "Wire connects a pin to itself" })
		}
	})

	return errors
}

function duplicates(values: readonly string[]): string[] {
	const seen = new Set<string>()
	const repeated = new Set<string>()
	for (const value of values) {
		if (seen.has(value)) repeated.add(value)
		seen.add(value)
	}
	return [...repeated]
}
