import { expect, test } from "vitest"
import { snap, wirePath } from "./geometry"

test("snap rounds to the grid", () => {
	expect(snap(29, 20)).toBe(20)
	expect(snap(31, 20)).toBe(40)
})

test("wires run horizontally then vertically unless they have bends", () => {
	expect(wirePath({ x: 0, y: 0 }, { x: 40, y: 20 })).toBe("M0 0 H40 V20")
	expect(wirePath({ x: 0, y: 0 }, { x: 40, y: 20 }, [{ x: 0, y: 20 }])).toBe("M0 0 L0 20 L40 20")
})
