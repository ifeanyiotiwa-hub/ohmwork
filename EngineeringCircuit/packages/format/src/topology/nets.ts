import type { Circuit, PinRef } from "../schema/circuit"
import { CHIP_PATH_SEPARATOR, chipDefinition, isChip, pinsOfPart } from "../schema/subcircuits"

export type Net = { index: number; pins: PinRef[]; isGround: boolean }

export const pinKey = (ref: PinRef): string => `${ref.componentId}:${ref.pin}`

/** What makes two net labels the same: their names without surrounding spaces, ignoring capitals (as SPICE node names). */
export const netLabelKey = (name: string): string => name.trim().toLowerCase()

/**
 * Pins joined by name rather than by wire: a net label's pin under its name, and each member of a bus connector
 * under its bus name and number (bus "D", pin d3: "d3"), so a label named "D3" taps it. And in an expanded circuit
 * (expandSubcircuits), each chip pin with the pin inside it stands for. Pins with the same key are one node; label
 * and chip keys are kept apart ("label:", "chip:"), so no name can join a chip's pin by accident.
 */
export function namedPins(circuit: Circuit): { ref: PinRef; key: string }[] {
	const ids = new Set(circuit.components.map((component) => component.id))
	return circuit.components.flatMap((component) => {
		switch (component.type) {
			case "net-label":
				return [{ ref: { componentId: component.id, pin: "terminal" }, key: `label:${netLabelKey(component.params.name)}` }]
			case "bus-4":
			case "bus-8":
				return pinsOfPart(component, circuit).map((pin) => ({
					ref: { componentId: component.id, pin },
					key: `label:${netLabelKey(`${component.params.name.trim()}${pin.slice(1)}`)}`,
				}))
			case "subcircuit": {
				// Only once its insides are in the circuit: a pin with nothing to join stays as it is.
				const definition = isChip(component) ? chipDefinition(circuit, component) : undefined
				return (definition?.pins ?? []).flatMap((pin) => {
					const inner = `${component.id}${CHIP_PATH_SEPARATOR}${pin.to.componentId}`
					if (!ids.has(inner)) return []
					const key = `chip:${component.id}:${pin.name}`
					return [
						{ ref: { componentId: component.id, pin: pin.name }, key },
						{ ref: { componentId: inner, pin: pin.to.pin }, key },
					]
				})
			}
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
		pinsOfPart(component, circuit).map((pin) => ({ componentId: component.id, pin })),
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
