import { expect, test } from "vitest"
import { COMPONENT_DEFINITIONS, idPrefixOf, isComponentType, pinsOf } from "../../src/schema/components/catalog"

const types = COMPONENT_DEFINITIONS.map((definition) => definition.type)

test("every component type is defined once", () => {
	expect(new Set(types).size).toBe(types.length)
})

test.each(COMPONENT_DEFINITIONS)("$type has unique, non-empty pin names", (definition) => {
	expect(definition.pins.length).toBeGreaterThan(0)
	expect(new Set(definition.pins).size).toBe(definition.pins.length)
	expect(definition.pins.every((pin) => pin.length > 0)).toBe(true)
})

test.each(COMPONENT_DEFINITIONS)("$type pins are what pinsOf returns", (definition) => {
	expect(pinsOf(definition.type)).toEqual(definition.pins)
})

test("every type has its own id prefix, e.g. R for resistor", () => {
	const prefixes = types.map(idPrefixOf)
	expect(prefixes.every((prefix) => /^[A-Z]+$/.test(prefix))).toBe(true)
	expect(new Set(prefixes).size).toBe(prefixes.length)
	expect(idPrefixOf("resistor")).toBe("R")
})

test.each(COMPONENT_DEFINITIONS)("$type default params are valid", (definition) => {
	expect(definition.schema.shape.params.safeParse(definition.defaults).success).toBe(true)
})

test("isComponentType recognises catalog types only", () => {
	expect(types.every(isComponentType)).toBe(true)
	expect(isComponentType("flux-capacitor")).toBe(false)
	expect(isComponentType(42)).toBe(false)
})
