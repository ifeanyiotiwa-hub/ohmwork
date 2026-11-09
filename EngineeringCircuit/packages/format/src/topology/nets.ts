import type { Circuit, PinRef } from "../schema/circuit"
import { pinsOf } from "../schema/components/catalog"

export type Net = { index: number; pins: PinRef[]; isGround: boolean }

export const pinKey = (ref: PinRef): string => `${ref.componentId}:${ref.pin}`

/** What makes two net labels the same: their names without surrounding spaces, ignoring capitals (as SPICE node names). */
export const netLabelKey = (name: string): string => name.trim().toLowerCase()

export function buildNets(circuit: Circuit): Net[] {
	const parent = new Map<string, string>()

	const root = (key: string): string => {
		let current = key
		while (parent.get(current) !== current) {
			current = parent.get(current) ?? current
		}
		parent.set(key, current)
		return current
	}

	const allPins: PinRef[] = circuit.components.flatMap((component) =>
		pinsOf(component.type).map((pin) => ({ componentId: component.id, pin })),
	)
	allPins.forEach((ref) => parent.set(pinKey(ref), pinKey(ref)))
	circuit.wires.forEach((wire) => parent.set(root(pinKey(wire.from)), root(pinKey(wire.to))))
	// Net labels: the first label of each name stands for it; the others join it.
	const firstLabelOf = new Map<string, string>()
	for (const component of circuit.components) {
		if (component.type !== "net-label") continue
		const name = netLabelKey(component.params.name)
		const key = pinKey({ componentId: component.id, pin: "terminal" })
		const first = firstLabelOf.get(name)
		if (first === undefined) firstLabelOf.set(name, key)
		else parent.set(root(key), root(first))
	}

	const groundIds = new Set(circuit.components.filter((c) => c.type === "ground").map((c) => c.id))
	const netsByRoot = new Map<string, Net>()

	for (const ref of allPins) {
		const key = root(pinKey(ref))
		let net = netsByRoot.get(key)
		if (!net) {
			net = { index: netsByRoot.size, pins: [], isGround: false }
			netsByRoot.set(key, net)
		}
		net.pins.push(ref)
		if (groundIds.has(ref.componentId)) net.isGround = true
	}

	return [...netsByRoot.values()]
}
