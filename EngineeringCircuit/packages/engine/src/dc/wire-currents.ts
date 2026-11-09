import { type Circuit, type Net, buildNets, netLabelKey, pinKey, pinsOf } from "@engineering-circuit/format"
import type { DcSolution } from "./solve-dc"

/** `wireId` undefined: the unseen link between two net labels of one name, which carries current but is no wire. */
type Edge = { id: string; wireId: string | undefined; neighbour: string; forward: boolean }

export function wireCurrents(circuit: Circuit, solution: DcSolution): Record<string, number> {
	const outflow = partOutflows(circuit, solution)
	const groundIds = new Set(circuit.components.filter((c) => c.type === "ground").map((c) => c.id))
	const currents: Record<string, number> = Object.fromEntries(circuit.wires.map((wire) => [wire.id, 0]))
	const edges = adjacency(circuit)

	for (const net of buildNets(circuit)) {
		balanceThroughGround(net, groundIds, outflow)
		const [root] = net.pins
		if (root) carrySubtree(pinKey(root), undefined, edges, outflow, currents, new Set())
	}
	return currents
}

function partOutflows(circuit: Circuit, solution: DcSolution): Map<string, number> {
	const outflow = new Map<string, number>()
	for (const component of circuit.components) {
		const reading = solution.readings[component.id]
		const [first, second] = pinsOf(component.type)
		if (!reading || !first || !second) continue
		outflow.set(pinKey({ componentId: component.id, pin: first }), reading.current)
		outflow.set(pinKey({ componentId: component.id, pin: second }), -reading.current)
	}
	return outflow
}

function balanceThroughGround(net: Net, groundIds: ReadonlySet<string>, outflow: Map<string, number>): void {
	const groundPin = net.pins.find((pin) => groundIds.has(pin.componentId))
	if (!groundPin) return
	const intoParts = net.pins.reduce((sum, pin) => sum + (outflow.get(pinKey(pin)) ?? 0), 0)
	outflow.set(pinKey(groundPin), -intoParts)
}

function adjacency(circuit: Circuit): Map<string, Edge[]> {
	const edges = new Map<string, Edge[]>()
	const link = (from: string, edge: Edge) => edges.set(from, [...(edges.get(from) ?? []), edge])
	for (const wire of circuit.wires) {
		const from = pinKey(wire.from)
		const to = pinKey(wire.to)
		link(from, { id: wire.id, wireId: wire.id, neighbour: to, forward: true })
		link(to, { id: wire.id, wireId: wire.id, neighbour: from, forward: false })
	}
	// Each net label is linked to the first label of its name, so the current can be followed from one to the other.
	const firstLabelOf = new Map<string, string>()
	for (const component of circuit.components) {
		if (component.type !== "net-label") continue
		const name = netLabelKey(component.params.name)
		const pin = pinKey({ componentId: component.id, pin: "terminal" })
		const first = firstLabelOf.get(name)
		if (first === undefined) {
			firstLabelOf.set(name, pin)
			continue
		}
		const id = `label:${pin}`
		link(first, { id, wireId: undefined, neighbour: pin, forward: true })
		link(pin, { id, wireId: undefined, neighbour: first, forward: false })
	}
	return edges
}

function carrySubtree(
	pin: string,
	viaEdge: string | undefined,
	edges: Map<string, Edge[]>,
	outflow: Map<string, number>,
	currents: Record<string, number>,
	visited: Set<string>,
): number {
	visited.add(pin)
	let subtreeOutflow = outflow.get(pin) ?? 0
	for (const edge of edges.get(pin) ?? []) {
		if (edge.id === viaEdge || visited.has(edge.neighbour)) continue
		const intoChild = carrySubtree(edge.neighbour, edge.id, edges, outflow, currents, visited)
		if (edge.wireId !== undefined) currents[edge.wireId] = edge.forward ? intoChild : -intoChild
		subtreeOutflow += intoChild
	}
	return subtreeOutflow
}
