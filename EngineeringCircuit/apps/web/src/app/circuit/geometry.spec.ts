import type { Component } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { pinPosition, rotate, snap, wirePath } from "./geometry"

const resistor = (rotation: Component["rotation"]): Component => ({
	id: "R1",
	type: "resistor",
	position: { x: 100, y: 100 },
	rotation,
	params: { resistance: 1 },
})

test("rotation turns clockwise in screen coordinates", () => {
	expect(rotate({ x: 40, y: 0 }, 90)).toEqual({ x: -0, y: 40 })
	expect(rotate({ x: 40, y: 0 }, 180)).toEqual({ x: -40, y: -0 })
	expect(rotate({ x: 40, y: 0 }, 270)).toEqual({ x: 0, y: -40 })
})

test("pin positions follow the part's position and rotation", () => {
	expect(pinPosition(resistor(0), "a")).toEqual({ x: 60, y: 100 })
	expect(pinPosition(resistor(90), "b")).toEqual({ x: 100, y: 140 })
})

test("snap rounds to the grid", () => {
	expect(snap(29, 20)).toBe(20)
	expect(snap(31, 20)).toBe(40)
})

test("wires run horizontally then vertically unless they have bends", () => {
	expect(wirePath({ x: 0, y: 0 }, { x: 40, y: 20 })).toBe("M0 0 H40 V20")
	expect(wirePath({ x: 0, y: 0 }, { x: 40, y: 20 }, [{ x: 0, y: 20 }])).toBe("M0 0 L0 20 L40 20")
})
