import { expect, test } from "vitest"
import { steppedIndex } from "./part-palette"

test("arrow keys step round the row; Home and End go to its ends; other keys do nothing", () => {
	expect(steppedIndex("ArrowRight", 0, 7)).toBe(1)
	expect(steppedIndex("ArrowRight", 6, 7)).toBe(0)
	expect(steppedIndex("ArrowLeft", 0, 7)).toBe(6)
	expect(steppedIndex("Home", 4, 7)).toBe(0)
	expect(steppedIndex("End", 1, 7)).toBe(6)
	expect(steppedIndex("Enter", 1, 7)).toBeUndefined()
})

test("up and down step like left and right, for the categories listed down the side", () => {
	expect(steppedIndex("ArrowDown", 6, 7)).toBe(0)
	expect(steppedIndex("ArrowUp", 0, 7)).toBe(6)
})
