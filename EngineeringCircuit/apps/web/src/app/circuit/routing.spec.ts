import type { Point } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import type { WireEnd } from "./geometry"
import { type Box, placeBox, routeAround } from "./routing"

const GRID = 20
const end = (x: number, y: number, direction: Point): WireEnd => ({ at: { x, y }, direction })

const crossesInside = (points: Point[], box: Box) =>
	points.slice(1).some((point, index) => {
		const previous = points[index]
		if (!previous) return false
		const steps = Math.max(Math.abs(point.x - previous.x), Math.abs(point.y - previous.y)) / GRID
		for (let step = 0; step <= steps; step++) {
			const x = previous.x + (Math.sign(point.x - previous.x) * step * GRID)
			const y = previous.y + (Math.sign(point.y - previous.y) * step * GRID)
			if (x > box.left && x < box.right && y > box.top && y < box.bottom) return true
		}
		return false
	})

/** A part body from x 160..240, y -20..20: in the way of a straight wire along y = 0. */
const blocker: Box = { left: 160, top: -20, right: 240, bottom: 20 }

test("a straight wire with nothing in the way stays straight", () => {
	const from = end(40, 0, { x: 1, y: 0 })
	const to = end(360, 0, { x: -1, y: 0 })
	expect(routeAround(from, to, [], GRID)).toEqual([from.at, to.at])
})

test("a wire goes around a part in its way instead of through it", () => {
	const from = end(40, 0, { x: 1, y: 0 })
	const to = end(360, 0, { x: -1, y: 0 })
	const points = routeAround(from, to, [blocker], GRID)
	expect(points.at(0)).toEqual(from.at)
	expect(points.at(-1)).toEqual(to.at)
	expect(crossesInside(points, blocker)).toBe(false)
	expect(points.length).toBe(6)
})

test("routes avoid the wire's own parts too", () => {
	const ownPart: Box = { left: -40, top: -20, right: 40, bottom: 20 }
	const from = end(40, 0, { x: 1, y: 0 })
	const to = end(-120, 0, { x: 1, y: 0 })
	const points = routeAround(from, to, [ownPart], GRID)
	expect(crossesInside(points, ownPart)).toBe(false)
})

test("pins off the grid fall back to the simple route", () => {
	const from = end(45, 3, { x: 1, y: 0 })
	const to = end(200, 60, { x: 0, y: -1 })
	expect(routeAround(from, to, [blocker], GRID)).toEqual([from.at, { x: 200, y: 3 }, to.at])
})

test("a pin boxed in by other parts still gets a wire", () => {
	const from = end(40, 0, { x: 1, y: 0 })
	const to = end(360, 0, { x: -1, y: 0 })
	const wall: Box = { left: 50, top: -400, right: 70, bottom: 400 }
	expect(routeAround(from, to, [wall], GRID).length).toBeGreaterThanOrEqual(2)
})

test("a body box turns with its part", () => {
	const body: Box = { left: -40, top: -20, right: 40, bottom: 20 }
	expect(placeBox(body, { x: 100, y: 100 }, 90)).toEqual({ left: 80, top: 60, right: 120, bottom: 140 })
})
