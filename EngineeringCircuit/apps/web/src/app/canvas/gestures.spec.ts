import { expect, test } from "vitest"
import { pinchView } from "./gestures"

const start = { x: 0, y: 0, width: 800, height: 400 }
const limits = { minWidth: 200, maxWidth: 4000 }
// The canvas is 800 screen pixels wide, so one pixel is one circuit unit at the start.
const screenWidth = 800

test("spreading two fingers to twice their distance zooms in two times around the point between them", () => {
	const view = pinchView(start, [{ x: 300, y: 200 }, { x: 500, y: 200 }], [{ x: 200, y: 200 }, { x: 600, y: 200 }], screenWidth, limits)
	expect(view).toEqual({ x: 200, y: 100, width: 400, height: 200 })
})

test("moving both fingers together pans: the circuit point between them follows the fingers", () => {
	const view = pinchView(start, [{ x: 300, y: 200 }, { x: 500, y: 200 }], [{ x: 350, y: 250 }, { x: 550, y: 250 }], screenWidth, limits)
	expect(view).toEqual({ x: -50, y: -50, width: 800, height: 400 })
})

test("zoom stops at the same limits as the mouse wheel", () => {
	const closer = pinchView(start, [{ x: 390, y: 200 }, { x: 410, y: 200 }], [{ x: 0, y: 200 }, { x: 800, y: 200 }], screenWidth, limits)
	expect(closer.width).toBe(200)
	expect(closer.height).toBe(100)
	const farther = pinchView(start, [{ x: 0, y: 200 }, { x: 800, y: 200 }], [{ x: 399, y: 200 }, { x: 401, y: 200 }], screenWidth, limits)
	expect(farther.width).toBe(4000)
})

test("two fingers on the same spot change nothing rather than dividing by zero", () => {
	const same = { x: 400, y: 200 }
	expect(pinchView(start, [same, same], [same, same], screenWidth, limits)).toEqual(start)
})
