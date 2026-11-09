import { expect, test } from "vitest"
import { DEFAULT_UI_CONFIG } from "./ui-config"
import { flowOf, spinOf, voltageColour } from "./visuals"

const flow = DEFAULT_UI_CONFIG.flow

test("no animation below the smallest visible current", () => {
	expect(flowOf(0, flow)).toBeUndefined()
	expect(flowOf(1e-12, flow)).toBeUndefined()
})

test("bigger currents move faster; negative currents run backwards", () => {
	const small = flowOf(1e-3, flow)
	const large = flowOf(1, flow)
	expect(small && large && large.seconds < small.seconds).toBe(true)
	expect(flowOf(-1, flow)?.reverse).toBe(true)
	expect(flowOf(1, flow)?.reverse).toBe(false)
})

test("speed is capped so huge currents stay readable", () => {
	expect(flowOf(1e6, flow)?.seconds).toBeCloseTo(flow.dashPeriod / flow.maxPixelsPerSecond)
})

test("voltage colours: grey at 0 V, green positive, red negative", () => {
	expect(voltageColour(0, 6)).toBe("hsl(220 8% 55%)")
	expect(voltageColour(6, 6)).toBe("hsl(145 80% 45%)")
	expect(voltageColour(-6, 6)).toBe("hsl(0 80% 45%)")
})

test("a motor turns at its simulated speed in real time, no faster than the screen can show", () => {
	const spin = DEFAULT_UI_CONFIG.spin
	// 813.73 rad/s at a simulation speed of 0.01 is 8.14 rad/s on screen: 0.772 s a turn.
	expect(spinOf(813.73, 0.01, spin)?.seconds).toBeCloseTo(0.7722, 3)
	expect(spinOf(-813.73, 0.01, spin)?.reverse).toBe(true)
	expect(spinOf(813.73, 1, spin)?.seconds).toBe(spin.minSecondsPerTurn)
	expect(spinOf(0, 0.01, spin)).toBeUndefined()
	expect(spinOf(0.01, 0.01, spin)).toBeUndefined()
})
