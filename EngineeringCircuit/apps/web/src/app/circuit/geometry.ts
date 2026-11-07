import type { Component, Point } from "@engineering-circuit/format"
import { SYMBOLS } from "./symbols"

export function rotate({ x, y }: Point, degrees: Component["rotation"]): Point {
	switch (degrees) {
		case 0:
			return { x, y }
		case 90:
			return { x: -y, y: x }
		case 180:
			return { x: -x, y: -y }
		case 270:
			return { x: y, y: -x }
	}
}

export function pinPosition(component: Component, pin: string, at: Point = component.position): Point {
	const local = SYMBOLS[component.type].pins[pin] ?? { x: 0, y: 0 }
	const turned = rotate(local, component.rotation)
	return { x: at.x + turned.x, y: at.y + turned.y }
}

export const snap = (value: number, grid: number) => Math.round(value / grid) * grid

export function wirePath(from: Point, to: Point, bends: readonly Point[] = []): string {
	if (bends.length > 0) return `M${from.x} ${from.y} ${[...bends, to].map((p) => `L${p.x} ${p.y}`).join(" ")}`
	return `M${from.x} ${from.y} H${to.x} V${to.y}`
}
