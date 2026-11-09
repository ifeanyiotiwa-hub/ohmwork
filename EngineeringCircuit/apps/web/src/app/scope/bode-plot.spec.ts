import type { AcPoint } from "@engineering-circuit/engine"
import { expect, test } from "vitest"
import { bodePlot } from "./bode-plot"

const size = { width: 100, height: 50 }
/** P1 across a 1:1 path (0 dB, 0°), P2 at a tenth and 90° behind (−20 dB, −90°). */
const points: AcPoint[] = [10, 100, 1000].map((frequency) => ({
	frequency,
	pinVoltages: { "P1:positive": { re: 2, im: 0 }, "P1:negative": { re: 0, im: 0 }, "P2:positive": { re: 0, im: -0.2 }, "P2:negative": { re: 0, im: 0 } },
}))
const coordinates = (polyline: string | undefined) => polyline?.split(" ").map((pair) => pair.split(",").map(Number)) ?? []

test("frequency runs across on a log scale, with a line at each decade", () => {
	const plot = bodePlot(points, ["P1"], { re: 2, im: 0 }, size)
	expect(coordinates(plot.traces[0]?.gain).map(([x]) => x)).toEqual([0, 50, 100])
	expect(plot.decades).toEqual([{ x: 50, frequency: 100 }])
	expect(plot.range).toEqual({ start: 10, stop: 1000 })
})

test("gain is in dB relative to the input, on a scale rounded out to 10 dB; phase spans ±180°", () => {
	const plot = bodePlot(points, ["P1", "P2"], { re: 2, im: 0 }, size)
	expect(plot.gain).toEqual({ min: -30, max: 10 })
	const [unity, tenth] = plot.traces
	expect(unity?.peak).toBeCloseTo(0, 9)
	expect(tenth?.peak).toBeCloseTo(-20, 9)
	// 0 dB is a quarter of the way down a −30…10 dB scale; −20 dB three quarters.
	expect(coordinates(unity?.gain).map(([, y]) => y)).toEqual([12.5, 12.5, 12.5])
	expect(coordinates(tenth?.gain).map(([, y]) => y)).toEqual([37.5, 37.5, 37.5])
	// 0° is half-way down; −90° three quarters.
	expect(coordinates(unity?.phase).map(([, y]) => y)).toEqual([25, 25, 25])
	expect(coordinates(tenth?.phase).map(([, y]) => y)).toEqual([37.5, 37.5, 37.5])
})

test("a flat response still gets a scale, and no points give empty traces", () => {
	expect(bodePlot(points, ["P1"], { re: 2, im: 0 }, size).gain).toEqual({ min: -10, max: 10 })
	const empty = bodePlot([], ["P1"], { re: 1, im: 0 }, size)
	expect(empty.traces).toEqual([{ id: "P1", gain: "", phase: "", peak: undefined }])
})
