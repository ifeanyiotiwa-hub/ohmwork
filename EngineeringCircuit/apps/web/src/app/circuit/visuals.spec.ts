import { expect, test } from "vitest"
import { DEFAULT_UI_CONFIG } from "./ui-config"
import { flowOf, voltageColour } from "./visuals"

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
