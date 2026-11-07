import { expect, test } from "vitest"
import { PIN_OFFSETS, pinPosition, rotate } from "../../src/layout/pins"
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
