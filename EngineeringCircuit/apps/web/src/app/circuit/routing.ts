import { type Component, type Point, rotate } from "@engineering-circuit/format"
import { type WireEnd, routeWire, simplify } from "./geometry"

/** A part's body on the canvas; wires keep at least one grid square away from it. */
export type Box = { left: number; top: number; right: number; bottom: number }

/** A body box (given at rotation 0) placed on the canvas at `at` with the part's rotation. */
export function placeBox(body: Box, at: Point, rotation: Component["rotation"]): Box {
	const corners = [rotate({ x: body.left, y: body.top }, rotation), rotate({ x: body.right, y: body.bottom }, rotation)]
	const xs = corners.map((corner) => at.x + corner.x)
	const ys = corners.map((corner) => at.y + corner.y)
	return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

/** Extra cost of a corner, in grid squares: prefers a slightly longer wire with fewer turns. */
const CORNER_COST = 3
/** Grid squares searched beyond the parts and pins, so a wire can go around the outside. */
const SEARCH_MARGIN = 3

type State = { column: number; row: number; direction: number; cost: number; estimate: number; previous: State | undefined }

const DIRECTIONS: readonly Point[] = [
	{ x: 1, y: 0 },
	{ x: 0, y: 1 },
	{ x: -1, y: 0 },
	{ x: 0, y: -1 },
]

/**
 * A grid-following wire that avoids every part's body (A* search, corners cost extra). It leaves the first
 * pin outward and enters the last pin from outside. Falls back to `routeWire` when the pins are off the grid
 * or no clear path exists.
 */
export function routeAround(from: WireEnd, to: WireEnd, obstacles: readonly Box[], grid: number): Point[] {
	const fallback = () => routeWire(from, to, grid)
	const startDirection = directionIndex(from.direction)
	const endDirection = directionIndex({ x: -to.direction.x, y: -to.direction.y })
	if (startDirection === undefined || endDirection === undefined) return fallback()
	if (![from.at.x, from.at.y, to.at.x, to.at.y].every((value) => value % grid === 0)) return fallback()

	const toCell = (point: Point) => ({ column: point.x / grid, row: point.y / grid })
	const start = toCell({ x: from.at.x + from.direction.x * grid, y: from.at.y + from.direction.y * grid })
	const goal = toCell({ x: to.at.x + to.direction.x * grid, y: to.at.y + to.direction.y * grid })
	const blocked = (column: number, row: number) =>
		obstacles.some(
			(box) =>
				column * grid >= box.left && column * grid <= box.right && row * grid >= box.top && row * grid <= box.bottom,
		)
	if (blocked(start.column, start.row) || blocked(goal.column, goal.row)) return fallback()

	const bounds = searchBounds([from.at, to.at], obstacles, grid)
	const found = search(start, startDirection, goal, endDirection, blocked, bounds)
	if (!found) return fallback()

	const cells: Point[] = []
	for (let state: State | undefined = found; state; state = state.previous) {
		cells.push({ x: state.column * grid, y: state.row * grid })
	}
	return simplify([from.at, ...cells.reverse(), to.at])
}

type Bounds = { minColumn: number; maxColumn: number; minRow: number; maxRow: number }

function searchBounds(points: readonly Point[], obstacles: readonly Box[], grid: number): Bounds {
	const xs = [...points.map((point) => point.x), ...obstacles.flatMap((box) => [box.left, box.right])]
	const ys = [...points.map((point) => point.y), ...obstacles.flatMap((box) => [box.top, box.bottom])]
	return {
		minColumn: Math.floor(Math.min(...xs) / grid) - SEARCH_MARGIN,
		maxColumn: Math.ceil(Math.max(...xs) / grid) + SEARCH_MARGIN,
		minRow: Math.floor(Math.min(...ys) / grid) - SEARCH_MARGIN,
		maxRow: Math.ceil(Math.max(...ys) / grid) + SEARCH_MARGIN,
	}
}

/** A* over (cell, heading); the goal must be left in `endDirection` to enter the pin from outside. */
function search(
	start: { column: number; row: number },
	startDirection: number,
	goal: { column: number; row: number },
	endDirection: number,
	blocked: (column: number, row: number) => boolean,
	bounds: Bounds,
): State | undefined {
	const distance = (column: number, row: number) => Math.abs(goal.column - column) + Math.abs(goal.row - row)
	const best = new Map<string, number>()
	const open = new MinHeap<State>((state) => state.cost + state.estimate)
	open.push({ ...start, direction: startDirection, cost: 0, estimate: distance(start.column, start.row), previous: undefined })

	for (let state = open.pop(); state; state = open.pop()) {
		if (state.column === goal.column && state.row === goal.row) {
			if (state.direction === endDirection) return state
			open.push({ ...state, direction: endDirection, cost: state.cost + CORNER_COST, previous: state.previous })
			continue
		}
		const key = `${state.column},${state.row},${state.direction}`
		if ((best.get(key) ?? Number.POSITIVE_INFINITY) <= state.cost) continue
		best.set(key, state.cost)

		DIRECTIONS.forEach((step, direction) => {
			if (direction === (state.direction + 2) % DIRECTIONS.length) return
			const column = state.column + step.x
			const row = state.row + step.y
			if (column < bounds.minColumn || column > bounds.maxColumn || row < bounds.minRow || row > bounds.maxRow) return
			if (blocked(column, row)) return
			const cost = state.cost + 1 + (direction === state.direction ? 0 : CORNER_COST)
			open.push({ column, row, direction, cost, estimate: distance(column, row), previous: state })
		})
	}
	return undefined
}

function directionIndex(direction: Point): number | undefined {
	const index = DIRECTIONS.findIndex((candidate) => candidate.x === direction.x && candidate.y === direction.y)
	return index === -1 ? undefined : index
}

class MinHeap<Item> {
	private readonly items: Item[] = []

	constructor(private readonly priority: (item: Item) => number) {}

	push(item: Item): void {
		this.items.push(item)
		let index = this.items.length - 1
		while (index > 0) {
			const parent = (index - 1) >> 1
			if (this.rank(parent) <= this.rank(index)) break
			this.swap(parent, index)
			index = parent
		}
	}

	pop(): Item | undefined {
		const top = this.items[0]
		const last = this.items.pop()
		if (this.items.length > 0 && last !== undefined) {
			this.items[0] = last
			let index = 0
			for (;;) {
				const left = index * 2 + 1
				const right = left + 1
				let smallest = index
				if (left < this.items.length && this.rank(left) < this.rank(smallest)) smallest = left
				if (right < this.items.length && this.rank(right) < this.rank(smallest)) smallest = right
				if (smallest === index) break
				this.swap(index, smallest)
				index = smallest
			}
		}
		return top
	}

	private rank(index: number): number {
		const item = this.items[index]
		return item === undefined ? Number.POSITIVE_INFINITY : this.priority(item)
	}

	private swap(first: number, second: number): void {
		const a = this.items[first]
		const b = this.items[second]
		if (a === undefined || b === undefined) return
		this.items[first] = b
		this.items[second] = a
	}
}
