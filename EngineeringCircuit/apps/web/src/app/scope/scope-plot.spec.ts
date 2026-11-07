import { expect, test } from "vitest"
import { scopePlot } from "./scope-plot"

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
	expect(scopePlot([], ["P1"], 1, size).traces).toEqual([{ id: "P1", points: "", latest: undefined }])
})
