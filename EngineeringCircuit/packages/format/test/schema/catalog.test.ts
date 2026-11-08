import { expect, test } from "vitest"
import { COMPONENT_CATEGORIES, COMPONENT_DEFINITIONS, idPrefixOf, isComponentType, pinsOf } from "../../src/schema/components/catalog"
import { LED_MODELS } from "../../src/schema/components/semiconductors"

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

test("wave sources need a positive frequency and a duty cycle between 0 and 1", () => {
	const square = COMPONENT_DEFINITIONS.find((definition) => definition.type === "square-source")
	const ac = COMPONENT_DEFINITIONS.find((definition) => definition.type === "ac-source")
	if (!square || !ac) throw new Error("wave sources missing")
	expect(square.schema.shape.params.safeParse({ ...square.defaults, dutyCycle: 1.5 }).success).toBe(false)
	expect(ac.schema.shape.params.safeParse({ ...ac.defaults, frequency: 0 }).success).toBe(false)
	expect(ac.schema.shape.params.safeParse({ ...ac.defaults, amplitude: -1 }).success).toBe(true)
})

test("every type belongs to exactly one palette category", () => {
	const listed = COMPONENT_CATEGORIES.flatMap((category) => category.types)
	expect([...listed].sort()).toEqual([...types].sort())
	expect(COMPONENT_CATEGORIES.map((category) => category.name)).toEqual(["Sources", "Passive", "Switches", "Semiconductors", "Logic", "ICs", "Meters"])
})

test("every LED colour has a model and a current rating, and LEDs default to red", () => {
	expect(Object.keys(LED_MODELS).sort()).toEqual(["blue", "green", "red", "white", "yellow"])
	const led = COMPONENT_DEFINITIONS.find((definition) => definition.type === "led")
	expect(led?.defaults).toMatchObject({ color: "red", ...LED_MODELS.red })
})
