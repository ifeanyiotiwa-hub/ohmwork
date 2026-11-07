import type { Point } from "@engineering-circuit/format"

export const snap = (value: number, grid: number) => Math.round(value / grid) * grid

export function wirePath(from: Point, to: Point, bends: readonly Point[] = []): string {
	if (bends.length > 0) return `M${from.x} ${from.y} ${[...bends, to].map((p) => `L${p.x} ${p.y}`).join(" ")}`
	return `M${from.x} ${from.y} H${to.x} V${to.y}`
}
