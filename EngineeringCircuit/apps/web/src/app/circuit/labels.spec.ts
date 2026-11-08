import { expect, test } from "vitest"
import { labelPlacement, readingPlacement } from "./labels"
import { SYMBOLS } from "./symbols"

const at = { x: 100, y: 100 }

test("a sideways part's reading goes below its body, its name above: neither covers its pins' voltages", () => {
	const symbol = SYMBOLS["voltage-source"]
	expect(labelPlacement(symbol, 0, at).y).toBeLessThan(at.y)
	expect(readingPlacement(symbol, 0, at, false)).toEqual({ x: 100, y: 100 + symbol.body.bottom + 14, anchor: "middle" })
})

test("an upright part keeps name and reading together beside it", () => {
	const label = labelPlacement(SYMBOLS.resistor, 90, at)
	expect(label.anchor).toBe("start")
	expect(readingPlacement(SYMBOLS.resistor, 90, at, false)).toEqual({ ...label, y: label.y + 14 })
})

test("a meter shows its value under its name, above the dial", () => {
	const label = labelPlacement(SYMBOLS.voltmeter, 0, at)
	expect(readingPlacement(SYMBOLS.voltmeter, 0, at, true)).toEqual({ ...label, y: label.y + 14 })
})

test("a part whose name sits below its body (an LED, arrows above) gets its reading under the name, not on it", () => {
	const label = labelPlacement(SYMBOLS.led, 0, at)
	expect(label.y).toBeGreaterThan(at.y)
	expect(readingPlacement(SYMBOLS.led, 0, at, false)).toEqual({ ...label, y: label.y + 14 })
})
