import { expect, test } from "vitest"
import { COMPONENT_CATEGORIES, COMPONENT_DEFINITIONS, idPrefixOf, isComponentType, pinsOf } from "../../src/schema/components/catalog"
import { LED_MODELS } from "../../src/schema/components/semiconductors"

const types = COMPONENT_DEFINITIONS.map((definition) => definition.type)

test("every component type is defined once", () => {
	expect(new Set(types).size).toBe(types.length)
})

// A chip's pins come from its definition (pinsOfPart), so its type has none.
const FIXED_PIN_TYPES = COMPONENT_DEFINITIONS.filter((definition) => definition.type !== "subcircuit")

test.each(FIXED_PIN_TYPES)("$type has unique, non-empty pin names", (definition) => {
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

test("every type belongs to exactly one palette category, except chips (the palette lists the circuit's own)", () => {
	const listed = COMPONENT_CATEGORIES.flatMap((category) => category.types)
	expect([...listed].sort()).toEqual(types.filter((type) => type !== "subcircuit").sort())
	expect(COMPONENT_CATEGORIES.map((category) => category.name)).toEqual(["Sources", "Passive", "Switches", "Semiconductors", "Logic", "ICs", "Meters"])
})

test("a new RGB LED follows Kingbright WP154A4SUREQBFZGW: red uses the red model, green and blue the InGaN (3.3 V) one; 30/25/30 mA", () => {
	const rgb = COMPONENT_DEFINITIONS.find((definition) => definition.type === "rgb-led")
	expect(rgb?.defaults).toMatchObject({
		emissionCoefficient: LED_MODELS.red.emissionCoefficient,
		seriesResistance: LED_MODELS.red.seriesResistance,
		redSaturationCurrent: LED_MODELS.red.saturationCurrent,
		greenSaturationCurrent: LED_MODELS.blue.saturationCurrent,
		blueSaturationCurrent: LED_MODELS.blue.saturationCurrent,
		redMaxCurrent: 0.03,
		greenMaxCurrent: 0.025,
		blueMaxCurrent: 0.03,
	})
})

test("every LED colour has a model and a current rating, and LEDs default to red", () => {
	expect(Object.keys(LED_MODELS).sort()).toEqual(["blue", "green", "red", "white", "yellow"])
	const led = COMPONENT_DEFINITIONS.find((definition) => definition.type === "led")
	expect(led?.defaults).toMatchObject({ color: "red", ...LED_MODELS.red })
})

test("a new DC motor follows the FAULHABER 2224U012SR, and refuses a motor with no friction (it would spin up for ever)", () => {
	const motor = COMPONENT_DEFINITIONS.find((definition) => definition.type === "dc-motor")
	expect(motor?.pins).toEqual(["a", "b"])
	expect(motor?.defaults).toMatchObject({ resistance: 8.77, inductance: 203e-6, torqueConstant: 0.0146, inertia: 2.7e-7 })
	// Friction torque 0.2 mNm at the no-load speed of 7810 rpm, as a viscous damping.
	expect(motor?.defaults.damping).toBeCloseTo(0.2e-3 / ((7810 * 2 * Math.PI) / 60), 12)
	expect(motor?.schema.shape.params.safeParse({ ...motor?.defaults, damping: 0 }).success).toBe(false)
})

test("a new tri-state buffer follows the TI SN74HC125: about 30 Ω out, 35 mA at most", () => {
	const buffer = COMPONENT_DEFINITIONS.find((definition) => definition.type === "tri-state-buffer")
	expect(buffer?.pins).toEqual(["in", "enable", "out"])
	expect(buffer?.defaults).toEqual({ outputResistance: 30, maxCurrent: 0.035 })
})
