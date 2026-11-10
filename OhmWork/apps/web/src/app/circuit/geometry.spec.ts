import type { Point } from "@ohmwork/format"
import { describe, expect, test } from "vitest"
import { type WireEnd, pathThrough, routeWire, snap } from "./geometry"

const STUB = 20
const UP = { x: 0, y: -1 }
const DOWN = { x: 0, y: 1 }
const LEFT = { x: -1, y: 0 }
const RIGHT = { x: 1, y: 0 }
const end = (x: number, y: number, direction: Point): WireEnd => ({ at: { x, y }, direction })

const dot = (first: Point, second: Point) => first.x * second.x + first.y * second.y
const step = (from: Point, to: Point): Point => ({ x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) })

/** Every wire must be straight segments, leave its first pin outward, and arrive at its last pin from outside. */
function expectClean(points: Point[], from: WireEnd, to: WireEnd): void {
	expect(points.at(0)).toEqual(from.at)
	expect(points.at(-1)).toEqual(to.at)
	for (let index = 1; index < points.length; index++) {
		const [previous, current] = [points[index - 1], points[index]]
		if (!previous || !current) throw new Error("missing point")
		expect(previous.x === current.x || previous.y === current.y, "axis-aligned").toBe(true)
	}
	const [first, second] = points
	const [beforeLast, last] = points.slice(-2)
	if (!first || !second || !beforeLast || !last) throw new Error("a wire has at least two points")
	expect(dot(step(first, second), from.direction)).toBeGreaterThanOrEqual(0)
	expect(dot(step(beforeLast, last), to.direction)).toBeLessThanOrEqual(0)
}

test("snap rounds to the grid", () => {
	expect(snap(29, 20)).toBe(20)
	expect(snap(31, 20)).toBe(40)
})

test("paths go through every point", () => {
	expect(pathThrough([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 40, y: 20 }])).toBe("M0 0 L0 20 L40 20")
})

describe("routing", () => {
	test("pins facing each other on one line join straight", () => {
		const from = end(40, 0, RIGHT)
		const to = end(120, 0, LEFT)
		expect(routeWire(from, to, STUB)).toEqual([from.at, to.at])
	})

	test("a wire into the top pin of an upright part comes from above, not across its body", () => {
		const from = end(160, 80, UP)
		const to = end(0, 0, UP)
		const points = routeWire(from, to, STUB)
		expect(points).toEqual([from.at, { x: 160, y: 0 }, to.at])
		expectClean(points, from, to)
	})

	test("the plain L is kept when it is already clean", () => {
		const from = end(40, 0, RIGHT)
		const to = end(120, 60, UP)
		expect(routeWire(from, to, STUB)).toEqual([from.at, { x: 120, y: 0 }, to.at])
	})

	test("pins facing away from each other step out first", () => {
		const from = end(0, 0, LEFT)
		const to = end(100, 60, RIGHT)
		expectClean(routeWire(from, to, STUB), from, to)
	})

	test("back-to-back pins on one line go around, not through both parts", () => {
		const from = end(0, 0, LEFT)
		const to = end(100, 0, RIGHT)
		const points = routeWire(from, to, STUB)
		expectClean(points, from, to)
		expect(points.some((point) => point.y !== 0)).toBe(true)
	})

	test("every pin direction pair gives a clean wire", () => {
		const directions = [UP, DOWN, LEFT, RIGHT]
		for (const first of directions) {
			for (const second of directions) {
				for (const [x, y] of [[100, 60], [-100, 60], [0, 80], [100, 0], [-60, -60]] as const) {
					const from = end(0, 0, first)
					const to = end(x, y, second)
					expectClean(routeWire(from, to, STUB), from, to)
				}
			}
		}
	})
})
