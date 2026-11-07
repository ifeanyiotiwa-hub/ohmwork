import type { Point } from "@engineering-circuit/format"

/** One end of a wire: where the pin is and the direction it points, away from its part. */
export type WireEnd = { at: Point; direction: Point }

export const snap = (value: number, grid: number) => Math.round(value / grid) * grid

export function pathThrough(points: readonly Point[]): string {
	const [first, ...rest] = points
	if (!first) return ""
	return `M${first.x} ${first.y} ${rest.map((point) => `L${point.x} ${point.y}`).join(" ")}`
}

/**
 * A wire's corner points: straight segments that leave the first pin outward and reach the last pin from
 * outside its part, so a wire never runs back over the part it belongs to. Tries a one-corner route, then
 * the same after stepping `stub` out of both pins, then a detour around the side.
 */
export function routeWire(from: WireEnd, to: WireEnd, stub: number): Point[] {
	const direct = cleanRoute(from.at, from.direction, to.at, to.direction)
	if (direct) return direct

	const out = offset(from.at, from.direction, stub)
	const into = offset(to.at, to.direction, stub)
	const stepped = cleanRoute(out, from.direction, into, to.direction)
	if (stepped) return simplify([from.at, ...stepped, to.at])

	const side = offset({ x: 0, y: 0 }, sideways(from.direction), 2 * stub)
	const aside = { x: out.x + side.x, y: out.y + side.y }
	const around = cleanRoute(aside, sideways(from.direction), into, to.direction) ?? [aside, { x: into.x, y: aside.y }, into]
	return simplify([from.at, out, ...around, to.at])
}

function cleanRoute(start: Point, startDirection: Point, end: Point, endDirection: Point): Point[] | undefined {
	const corners = [
		{ x: end.x, y: start.y },
		{ x: start.x, y: end.y },
	]
	for (const corner of corners) {
		const points = simplify([start, corner, end])
		const [first, second] = points
		const [beforeLast, last] = points.slice(-2)
		if (!first || !second || !beforeLast || !last) return points
		const leavesOutward = dot(stepBetween(first, second), startDirection) >= 0
		const arrivesFromOutside = dot(stepBetween(beforeLast, last), endDirection) <= 0
		if (leavesOutward && arrivesFromOutside) return points
	}
	return undefined
}

/** Drops repeated points and corners that sit on a straight line. */
function simplify(points: readonly Point[]): Point[] {
	const distinct = points.filter((point, index) => {
		const previous = points[index - 1]
		return !previous || previous.x !== point.x || previous.y !== point.y
	})
	return distinct.filter((point, index) => {
		const previous = distinct[index - 1]
		const next = distinct[index + 1]
		if (!previous || !next) return true
		return !(previous.x === point.x && point.x === next.x) && !(previous.y === point.y && point.y === next.y)
	})
}

const dot = (first: Point, second: Point) => first.x * second.x + first.y * second.y
const stepBetween = (from: Point, to: Point): Point => ({ x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) })
const offset = (point: Point, direction: Point, distance: number): Point => ({
	x: point.x + direction.x * distance,
	y: point.y + direction.y * distance,
})
/** A quarter turn of a direction; straight down when there is no direction. */
const sideways = (direction: Point): Point =>
	direction.x === 0 && direction.y === 0 ? { x: 0, y: 1 } : { x: -direction.y || 0, y: direction.x || 0 }
