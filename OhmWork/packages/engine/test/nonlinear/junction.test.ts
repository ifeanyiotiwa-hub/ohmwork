import { expect, test } from "vitest"
import { THERMAL_VOLTAGE, criticalVoltage, limitJunction } from "../../src/nonlinear/junction"

// A silicon junction: scale = N·Vt, IS 1e-14 A.
const scale = THERMAL_VOLTAGE
const critical = criticalVoltage(scale, 1e-14)

test("small steps, and any step below the critical voltage, pass unchanged", () => {
	expect(limitJunction(0.62, 0.6, scale, critical)).toBe(0.62)
	expect(limitJunction(critical - 0.01, 0, scale, critical)).toBe(critical - 0.01)
})

test("a big jump up from a conducting junction lands where the exponential gives the current the last linearization predicted", () => {
	const previous = 0.7
	const next = 3
	const limited = limitJunction(next, previous, scale, critical)
	// The linearized current at `next` is I(prev)·(1 + Δv/scale); the limited voltage gives exactly that current.
	expect(Math.exp((limited - previous) / scale)).toBeCloseTo(1 + (next - previous) / scale, 9)
	expect(limited).toBeLessThan(next)
})

test("a big jump up from an off junction goes to scale·ln(v/scale), far below the jump", () => {
	expect(limitJunction(5, -1, scale, critical)).toBeCloseTo(scale * Math.log(5 / scale), 12)
})
