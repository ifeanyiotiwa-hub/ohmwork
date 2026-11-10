import { createCircuit } from "@ohmwork/format"
import { expect, test } from "vitest"
import { pictureBounds, pictureName } from "./export-picture"

test("a picture frames everything drawn (bodies, labels, notes as drawn, not their anchor points), with a margin", () => {
	const drawn = [
		{ x: -40, y: -20, width: 80, height: 40 },
		{ x: 300, y: 200, width: 180, height: 60 },
		{ x: 10, y: -46, width: 50, height: 14 },
	]
	expect(pictureBounds(drawn, 60)).toEqual({ x: -100, y: -106, width: 640, height: 426 })
})

test("an empty canvas still gets a small picture", () => {
	expect(pictureBounds([], 60)).toEqual({ x: -60, y: -60, width: 120, height: 120 })
})

test("a picture is named after the circuit", () => {
	expect(pictureName(createCircuit("Night light: v2"), "png")).toBe("night-light-v2.png")
	expect(pictureName(createCircuit(""), "svg")).toBe("circuit.svg")
})
