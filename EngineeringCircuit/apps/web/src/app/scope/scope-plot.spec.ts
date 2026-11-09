import { expect, test } from "vitest"
import { scopePlot, xyPlot } from "./scope-plot"

const samples = [
	{ time: 0.001, values: { P1: 0, P2: 5 } },
	{ time: 0.002, values: { P1: 2, P2: 5 } },
	{ time: 0.003, values: { P1: 4, P2: 5 } },
]
const size = { width: 100, height: 50 }

test("traces span the window from the newest sample backwards, scaled to fit with a margin", () => {
	const plot = scopePlot(samples, ["P1", "P2"], 0.002, size)
	expect(plot.window).toEqual({ start: 0.001, end: 0.003 })
	expect(plot.range.min).toBeLessThan(0)
	expect(plot.range.max).toBeGreaterThan(5)
	const [first] = plot.traces
	expect(first?.id).toBe("P1")
	expect(first?.latest).toBe(4)
	const points = first?.points.split(" ").map((pair) => pair.split(",").map(Number)) ?? []
	expect(points.map(([x]) => x)).toEqual([0, 50, 100])
	expect(points[0]?.[1]).toBeGreaterThan(points[2]?.[1] ?? 0)
})

test("samples older than the window are left out", () => {
	const plot = scopePlot(samples, ["P1"], 0.001, size)
	expect(plot.traces[0]?.points.split(" ")).toHaveLength(2)
})

test("a flat trace still gets a visible range", () => {
	const plot = scopePlot([{ time: 1, values: { P1: 3 } }], ["P1"], 1, size)
	expect(plot.range.max - plot.range.min).toBeGreaterThan(0)
})

test("no samples, no traces", () => {
	expect(scopePlot([], ["P1"], 1, size).traces).toEqual([{ id: "P1", points: "", latest: undefined, range: { min: -1.2, max: 1.2 } }])
})

/** A 0–5 V square wave, period 4 ms, rising at 2, 6, 10, 14 and 18 ms; sampled every 0.5 ms to 20 ms. */
const square = Array.from({ length: 41 }, (_, index) => {
	const time = index * 0.0005
	return { time, values: { P1: Math.floor(Math.round(time * 1e6) / 2000) % 2 === 1 ? 5 : 0, P2: 1 } }
})

test("triggered, the window starts at the latest rising crossing of the first trace's middle with a whole window after it", () => {
	const free = scopePlot(square, ["P1"], 0.004, size)
	expect(free.window.start).toBeCloseTo(0.016, 9)
	expect(free.triggered).toBe(false)
	const triggered = scopePlot(square, ["P1", "P2"], 0.004, size, { trigger: true })
	// Crossing 2.5 V half-way between the samples at 13.5 ms (0 V) and 14 ms (5 V).
	expect(triggered.window.start).toBeCloseTo(0.01375, 9)
	expect(triggered.window.end).toBeCloseTo(0.01775, 9)
	expect(triggered.triggered).toBe(true)
})

test("with nothing to trigger on (a flat first trace) it runs free", () => {
	const flat = scopePlot(square, ["P2", "P1"], 0.004, size, { trigger: true })
	expect(flat.triggered).toBe(false)
	expect(flat.window.start).toBeCloseTo(0.016, 9)
})

test("each trace can have its own scale: a flat one sits in the middle of its own", () => {
	const shared = scopePlot(samples, ["P1", "P2"], 0.002, size)
	const own = scopePlot(samples, ["P1", "P2"], 0.002, size, { separateScales: true })
	const heights = (plot: typeof shared, index: number) => plot.traces[index]?.points.split(" ").map((pair) => Number(pair.split(",")[1])) ?? []
	expect(heights(shared, 1).every((y) => y < 10)).toBe(true)
	expect(heights(own, 1)).toEqual([25, 25, 25])
	expect(own.traces[1]?.range).toEqual({ min: 3.8, max: 6.2 })
	expect(own.traces[0]?.range.min).toBeLessThan(0)
})

test("X-Y plots the second trace up against the first across", () => {
	const plot = xyPlot(
		[
			{ time: 0.001, values: { P1: 0, P2: 0 } },
			{ time: 0.002, values: { P1: 2, P2: 1 } },
			{ time: 0.003, values: { P1: 4, P2: 2 } },
		],
		"P1",
		"P2",
		0.002,
		size,
	)
	const points = plot.points.split(" ").map((pair) => pair.split(",").map(Number))
	// Ranges with 10% margin: x −0.4…4.4, y −0.2…2.2.
	expect(points[0]).toEqual([round(0.4 / 4.8 * 100), round(50 - (0.2 / 2.4) * 50)])
	expect(points[2]).toEqual([round(4.4 / 4.8 * 100), round(50 - (2.2 / 2.4) * 50)])
	expect(plot.x).toEqual({ min: -0.4, max: 4.4 })
})

const round = (value: number) => Math.round(value * 100) / 100
