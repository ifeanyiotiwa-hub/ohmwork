import type { z } from "zod"
import { type Circuit, CURRENT_VERSION, FORMAT_ID, type Subcircuit, type Wire, circuitSchema } from "../schema/circuit"
import { type Component, isComponentType } from "../schema/components/catalog"
import { CHIP_PATH_SEPARATOR, MAX_CHIP_DEPTH, chipDefinition, isChip, pinsOfPart } from "../schema/subcircuits"
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
		return failure("format", "Not an OhmWork circuit file")
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
	const errors: CircuitError[] = [...partsAndWiresErrors("", circuit.components, circuit.wires, circuit)]
	duplicates(circuit.notes.map((note) => note.id)).forEach((id) =>
		errors.push({ path: "notes", message: `Duplicate note id "${id}"` }),
	)
	duplicates(circuit.subcircuits.map((definition) => definition.id)).forEach((id) =>
		errors.push({ path: "subcircuits", message: `Duplicate chip id "${id}"` }),
	)
	circuit.subcircuits.forEach((definition, index) => {
		const path = `subcircuits[${index}]`
		errors.push(...partsAndWiresErrors(`${path}.`, definition.components, definition.wires, circuit))
		errors.push(...chipPinErrors(path, definition, circuit))
		if (containsItself(definition, circuit)) {
			errors.push({ path, message: `Chip "${definition.id}" is inside itself (directly or through other chips)` })
		}
	})
	return errors
}

/** Ids, chip references and wire ends, for the circuit (prefix "") or one chip's insides ("subcircuits[0]."). */
function partsAndWiresErrors(prefix: string, components: readonly Component[], wires: readonly Wire[], circuit: Circuit): CircuitError[] {
	const errors: CircuitError[] = []
	const componentsById = new Map(components.map((component) => [component.id, component]))
	duplicates(components.map((component) => component.id)).forEach((id) =>
		errors.push({ path: `${prefix}components`, message: `Duplicate component id "${id}"` }),
	)
	duplicates(wires.map((wire) => wire.id)).forEach((id) => errors.push({ path: `${prefix}wires`, message: `Duplicate wire id "${id}"` }))
	components.forEach((component, index) => {
		const path = `${prefix}components[${index}]`
		if (component.id.includes(CHIP_PATH_SEPARATOR)) {
			errors.push({ path, message: `Part id "${component.id}" has a "${CHIP_PATH_SEPARATOR}": that names parts inside chips` })
		}
		if (isChip(component) && !chipDefinition(circuit, component)) {
			errors.push({ path, message: `No chip "${component.params.definition}" in this circuit` })
		}
	})
	wires.forEach((wire, index) => {
		for (const end of ["from", "to"] as const) {
			const ref = wire[end]
			const path = `${prefix}wires[${index}].${end}`
			const component = componentsById.get(ref.componentId)
			if (!component) {
				errors.push({ path, message: `Unknown component "${ref.componentId}"` })
			} else if (!pinsOfPart(component, circuit).includes(ref.pin)) {
				const valid = pinsOfPart(component, circuit).join(", ")
				errors.push({ path, message: `${component.type} has no pin "${ref.pin}" (valid: ${valid})` })
			}
		}
		if (wire.from.componentId === wire.to.componentId && wire.from.pin === wire.to.pin) {
			errors.push({ path: `${prefix}wires[${index}]`, message: "Wire connects a pin to itself" })
		}
	})
	return errors
}

/** Each chip pin names a part inside it and one of that part's pins; pin names are unique. */
function chipPinErrors(path: string, definition: Subcircuit, circuit: Circuit): CircuitError[] {
	const errors: CircuitError[] = []
	duplicates(definition.pins.map((pin) => pin.name)).forEach((name) =>
		errors.push({ path: `${path}.pins`, message: `Duplicate pin name "${name}"` }),
	)
	definition.pins.forEach((pin, index) => {
		const inner = definition.components.find((component) => component.id === pin.to.componentId)
		if (!inner) {
			errors.push({ path: `${path}.pins[${index}]`, message: `Pin "${pin.name}" stands for "${pin.to.componentId}", which is not in the chip` })
		} else if (!pinsOfPart(inner, circuit).includes(pin.to.pin)) {
			errors.push({ path: `${path}.pins[${index}]`, message: `Pin "${pin.name}": ${inner.type} has no pin "${pin.to.pin}"` })
		}
	})
	return errors
}

/** Whether a chip contains itself, through any chain of chips inside it (or nests deeper than MAX_CHIP_DEPTH). */
function containsItself(definition: Subcircuit, circuit: Circuit): boolean {
	const inside = (current: Subcircuit, depth: number): boolean =>
		current.components.some((part) => {
			if (!isChip(part)) return false
			const next = chipDefinition(circuit, part)
			if (!next) return false
			return next.id === definition.id || depth >= MAX_CHIP_DEPTH || inside(next, depth + 1)
		})
	return inside(definition, 0)
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
