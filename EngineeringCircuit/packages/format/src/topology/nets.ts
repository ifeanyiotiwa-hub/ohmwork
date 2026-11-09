import type { Circuit, PinRef } from "../schema/circuit"
import { pinsOf } from "../schema/components/catalog"

export type Net = { index: number; pins: PinRef[]; isGround: boolean }

export const pinKey = (ref: PinRef): string => `${ref.componentId}:${ref.pin}`

/** What makes two net labels the same: their names without surrounding spaces, ignoring capitals (as SPICE node names). */
export const netLabelKey = (name: string): string => name.trim().toLowerCase()

/**
 * Pins joined by name rather than by wire: a net label's pin under its name, and each member of a bus connector
 * under its bus name and number (bus "D", pin d3: "d3"), so a label named "D3" taps it. Pins with the same key are
 * one node.
 */
export function namedPins(circuit: Circuit): { ref: PinRef; key: string }[] {
	return circuit.components.flatMap((component) => {
		switch (component.type) {
			case "net-label":
				return [{ ref: { componentId: component.id, pin: "terminal" }, key: netLabelKey(component.params.name) }]
			case "bus-4":
			case "bus-8":
				return pinsOf(component.type).map((pin) => ({
					ref: { componentId: component.id, pin },
					key: netLabelKey(`${component.params.name.trim()}${pin.slice(1)}`),
				}))
			default:
				return []
		}
	})
}

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
	// Pins joined by name: the first pin of each name stands for it; the others join it.
	const firstOf = new Map<string, string>()
	for (const { ref, key: name } of namedPins(circuit)) {
		const key = pinKey(ref)
		const first = firstOf.get(name)
		if (first === undefined) firstOf.set(name, key)
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
