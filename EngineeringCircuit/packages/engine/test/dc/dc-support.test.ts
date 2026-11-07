import { expect, test } from "vitest"
import { isDcSimulated } from "../../src/dc/branches"

test("reports which part types the DC engine can simulate", () => {
	expect(isDcSimulated("resistor")).toBe(true)
	expect(isDcSimulated("switch")).toBe(true)
	expect(isDcSimulated("diode")).toBe(false)
	expect(isDcSimulated("led")).toBe(false)
})
