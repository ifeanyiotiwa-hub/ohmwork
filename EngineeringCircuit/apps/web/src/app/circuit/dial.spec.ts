import { expect, test } from "vitest"
import { type Dial, dialOf, stepValue } from "./dial"

const dial = (type: Parameters<typeof dialOf>[0]): Dial => {
	const found = dialOf(type)
	if (!found) throw new Error(`no dial for ${type}`)
	return found
}

test("resistance, capacitance and the like step through the E12 series, across decades", () => {
	const e12 = dial("resistor")
	expect(stepValue(e12, 1000, 1)).toBeCloseTo(1200, 9)
	expect(stepValue(e12, 8200, 1)).toBeCloseTo(10000, 9)
	expect(stepValue(e12, 1000, -1)).toBeCloseTo(820, 9)
	expect(stepValue(e12, 1, -1)).toBeCloseTo(0.82, 9)
})

test("a value off the series moves to the next series value in that direction", () => {
	const e12 = dial("resistor")
	expect(stepValue(e12, 1100, 1)).toBeCloseTo(1200, 9)
	expect(stepValue(e12, 1100, -1)).toBeCloseTo(1000, 9)
	expect(stepValue(e12, 4.7e-6 * 1.01, -1)).toBeCloseTo(4.7e-6, 15)
})

test("voltages step by 0.1 V and may cross zero; currents keep their sign through the E12 series", () => {
	expect(stepValue(dial("voltage-source"), 5, 1)).toBeCloseTo(5.1, 9)
	expect(stepValue(dial("voltage-source"), 0.05, -1)).toBeCloseTo(0, 9)
	expect(stepValue(dial("voltage-source"), 0, -1)).toBeCloseTo(-0.1, 9)
	expect(stepValue(dial("current-source"), -0.01, 1)).toBeCloseTo(-0.012, 9)
})

test("a potentiometer's position moves 1% at a time and stops at the ends", () => {
	expect(stepValue(dial("potentiometer"), 0.5, 1)).toBeCloseTo(0.51, 9)
	expect(stepValue(dial("potentiometer"), 1, 1)).toBe(1)
	expect(stepValue(dial("potentiometer"), 0, -1)).toBe(0)
})

test("each dial turns one named parameter", () => {
	expect(dialOf("resistor")?.param).toBe("resistance")
	expect(dialOf("capacitor")?.param).toBe("capacitance")
	expect(dialOf("ac-source")?.param).toBe("amplitude")
	expect(dialOf("clock")?.param).toBe("frequency")
	expect(dialOf("ground")).toBeUndefined()
})
