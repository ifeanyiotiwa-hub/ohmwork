import { createCircuit } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { kvlExample } from "../circuit/examples"
import { pictureBounds } from "./export-picture"

test("a picture frames every part and note, with a margin", () => {
	const circuit = { ...kvlExample(), notes: [{ id: "note1", position: { x: 500, y: 300 }, text: "Hi" }] }
	expect(pictureBounds(circuit, 60)).toEqual({ x: -60, y: -60, width: 620, height: 420 })
})

test("an empty circuit still gets a small picture", () => {
	expect(pictureBounds(createCircuit("Empty"), 60)).toEqual({ x: -60, y: -60, width: 120, height: 120 })
})
