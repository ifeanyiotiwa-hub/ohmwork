import { type Circuit, type Component, type Point, netLabelKey, rotate } from "@ohmwork/format"
import { routeWire } from "./geometry"

/** Where the bus leaves a connector, and which way, at rotation 0 (its members are on the other side). */
export const BUS_EXIT: Point = { x: 20, y: 0 }
const EXIT_DIRECTION: Point = { x: 1, y: 0 }

export type BusLine = { name: string; from: string; to: string; points: Point[] }

const isBus = (part: Component): part is Extract<Component, { type: "bus-4" | "bus-8" }> => part.type === "bus-4" || part.type === "bus-8"

/**
 * The drawn buses: each bus connector joined to the next of the same name (in circuit order), routed like a wire from
 * bus side to bus side. Only a picture: the members are joined by name (format namedPins).
 */
export function busLines(circuit: Circuit, positionOf: (part: Component) => Point, stub: number): BusLine[] {
	const byName = new Map<string, Component[]>()
	for (const part of circuit.components.filter(isBus)) {
		const name = netLabelKey(part.params.name)
		byName.set(name, [...(byName.get(name) ?? []), part])
	}
	const exit = (part: Component) => {
		const at = positionOf(part)
		const offset = rotate(BUS_EXIT, part.rotation)
		return { at: { x: at.x + offset.x, y: at.y + offset.y }, direction: rotate(EXIT_DIRECTION, part.rotation) }
	}
	return [...byName].flatMap(([name, parts]) =>
		parts.slice(1).flatMap((part, index) => {
			const previous = parts[index]
			return previous ? [{ name, from: previous.id, to: part.id, points: routeWire(exit(previous), exit(part), stub) }] : []
		}),
	)
}
