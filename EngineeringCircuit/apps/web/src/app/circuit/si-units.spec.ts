import { describe, expect, test } from "vitest"
import { formatSi, parseSi, unitSymbolOf } from "./si-units"

describe("formatSi", () => {
	test.each([
		[1000, "Ω", "1 kΩ"],
		[4700, "Ω", "4.7 kΩ"],
		[0.005, "A", "5 mA"],
		[2, "A", "2 A"],
		[-6, "V", "-6 V"],
		[1e-6, "F", "1 µF"],
		[0.9999, "V", "1 V"],
		[0, "V", "0 V"],
	])("%d %s → %s", (value, unit, expected) => {
		expect(formatSi(value, unit)).toBe(expected)
	})
})

describe("parseSi", () => {
	test.each([
		["1k", 1000],
		["4.7 kΩ", 4700],
		["5mA", 0.005],
		["10", 10],
		["-3.3 V", -3.3],
		["2.2u", 2.2e-6],
		["1µF", 1e-6],
		["1e3", 1000],
	])("%s → %d", (text, expected) => {
		expect(parseSi(text)).toBeCloseTo(expected, 12)
	})

	test.each(["", "abc", "1..2", "k5"])("rejects %j", (text) => {
		expect(parseSi(text)).toBeUndefined()
	})
})

test("unit symbols come from the parameter description", () => {
	expect(unitSymbolOf("ohms")).toBe("Ω")
	expect(unitSymbolOf("amps, flowing out of the positive pin")).toBe("A")
	expect(unitSymbolOf("true = conducting")).toBe("")
})
