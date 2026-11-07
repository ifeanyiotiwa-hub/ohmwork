import { expect, test } from "vitest"
import { PIN_OFFSETS, pinDirection, pinPosition, rotate } from "../../src/layout/pins"
import { COMPONENT_DEFINITIONS, type Component, pinsOf } from "../../src/schema/components/catalog"

const resistor = (rotation: Component["rotation"]): Component => ({
	id: "R1",
	type: "resistor",
	position: { x: 100, y: 100 },
	rotation,
	params: { resistance: 1 },
})

test("every part type places exactly its own pins", () => {
	for (const { type } of COMPONENT_DEFINITIONS) {
		expect(Object.keys(PIN_OFFSETS[type]).sort(), type).toEqual([...pinsOf(type)].sort())
	}
})

test("rotation turns clockwise in screen coordinates (y grows downward)", () => {
	expect(rotate({ x: 40, y: 0 }, 90)).toEqual({ x: -0, y: 40 })
	expect(rotate({ x: 40, y: 0 }, 180)).toEqual({ x: -40, y: -0 })
	expect(rotate({ x: 40, y: 0 }, 270)).toEqual({ x: 0, y: -40 })
})

test("pin positions follow the part's position and rotation", () => {
	expect(pinPosition(resistor(0), "a")).toEqual({ x: 60, y: 100 })
	expect(pinPosition(resistor(90), "a")).toEqual({ x: 100, y: 60 })
	expect(pinPosition(resistor(90), "b")).toEqual({ x: 100, y: 140 })
})

test("a position can be overridden, e.g. while a part is being dragged", () => {
	expect(pinPosition(resistor(0), "b", { x: 0, y: 0 })).toEqual({ x: 40, y: 0 })
})

test("a pin points away from its part, turning with it", () => {
	expect(pinDirection(resistor(0), "a")).toEqual({ x: -1, y: 0 })
	expect(pinDirection(resistor(0), "b")).toEqual({ x: 1, y: 0 })
	expect(pinDirection(resistor(90), "a")).toEqual({ x: 0, y: -1 })
	expect(pinDirection({ ...resistor(0), id: "G", type: "ground", params: {} }, "terminal")).toEqual({ x: 0, y: -1 })
})

test("a corner pin points along its longer offset, sideways on a tie", () => {
	const transformer = { ...resistor(0), id: "T1", type: "transformer", params: { primaryInductance: 4, turnsRatio: 1, coupling: 0.999 } } as const
	expect(pinDirection(transformer, "primaryA")).toEqual({ x: -1, y: 0 })
	const spdt = { ...resistor(0), id: "SW1", type: "switch-spdt", params: { position: "a" } } as const
	expect(pinDirection(spdt, "b")).toEqual({ x: 1, y: 0 })
	expect(pinDirection({ ...spdt, rotation: 90 }, "b")).toEqual({ x: 0, y: 1 })
})
