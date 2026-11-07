import type { Circuit, Net, PinRef } from "@engineering-circuit/format"
import { DisjointSets } from "../graph/disjoint-sets"
import type { Branch } from "./branches"
import type { SimIssue } from "./issues"

export type NetBranch = Branch & { nets: [first: number, second: number] }

const quoted = (ids: readonly string[]) => ids.map((id) => `"${id}"`).join(", ")

function groundedSets(nets: readonly Net[]): DisjointSets {
	const sets = new DisjointSets(nets.length)
	const groundNets = nets.filter((net) => net.isGround)
	groundNets.forEach((net) => sets.union(net.index, groundNets[0]?.index ?? net.index))
	return sets
}

export function findShortCircuits(nets: readonly Net[], branches: readonly NetBranch[]): SimIssue[] {
	const sourceLoops = groundedSets(nets)
	const issues: SimIssue[] = []
	for (const branch of branches) {
		if (branch.kind !== "voltage" || sourceLoops.union(...branch.nets)) continue
		issues.push({
			componentIds: [branch.componentId],
			message: `Short circuit: "${branch.componentId}" is connected in a loop of voltage sources, closed switches, inductors, ammeters and wires with no resistance.`,
		})
	}
	return issues
}

export function conductiveSets(nets: readonly Net[], branches: readonly NetBranch[]): DisjointSets {
	const sets = groundedSets(nets)
	branches.filter((branch) => branch.kind !== "current").forEach((branch) => sets.union(...branch.nets))
	return sets
}

export function findCurrentWithoutPath(branches: readonly NetBranch[], conductive: DisjointSets): SimIssue[] {
	return branches
		.filter((branch) => branch.kind === "current" && !conductive.connected(...branch.nets))
		.map((branch) => ({
			componentIds: [branch.componentId],
			message: `No path for current: "${branch.componentId}" pushes current into a part of the circuit with no way back.`,
		}))
}

export type References = { referenceNets: Set<number>; warnings: SimIssue[] }

export function chooseReferences(
	circuit: Circuit,
	nets: readonly Net[],
	branches: readonly NetBranch[],
	conductive: DisjointSets,
	/** Islands that need no ground (e.g. an ohmmeter on an unpowered network) are solved without a warning. */
	needsNoGround: (componentIds: readonly string[]) => boolean = () => false,
): References {
	const groundRoots = new Set(nets.filter((net) => net.isGround).map((net) => conductive.find(net.index)))
	const floatingRoots = new Set(
		nets.map((net) => conductive.find(net.index)).filter((root) => !groundRoots.has(root)),
	)

	const referenceNets = new Set(nets.filter((net) => net.isGround).map((net) => net.index))
	const warnings: SimIssue[] = []

	for (const root of floatingRoots) {
		const islandNets = nets.filter((net) => conductive.find(net.index) === root)
		const reference = referencePinOf(islandNets, branches, conductive, root)
		referenceNets.add(reference.net)

		const islandPins = new Set(islandNets.flatMap((net) => net.pins.map((pin) => pin.componentId)))
		const componentIds = circuit.components.map((component) => component.id).filter((id) => islandPins.has(id))
		if (needsNoGround(componentIds)) continue
		const subject = componentIds.length === 1 ? "Its voltages are" : "Their voltages are"
		warnings.push({
			componentIds,
			message: `Not connected to ground: ${quoted(componentIds)}. ${subject} measured from "${reference.pin.componentId}" pin "${reference.pin.pin}".`,
		})
	}

	return { referenceNets, warnings }
}

function referencePinOf(
	islandNets: readonly Net[],
	branches: readonly NetBranch[],
	conductive: DisjointSets,
	root: number,
): { net: number; pin: PinRef } {
	const source = branches.find((branch) => branch.kind === "voltage" && conductive.find(branch.nets[1]) === root)
	if (source) return { net: source.nets[1], pin: { componentId: source.componentId, pin: source.pins[1] } }

	const [firstNet] = islandNets
	const [firstPin] = firstNet?.pins ?? []
	if (!firstNet || !firstPin) throw new Error("A floating island always has at least one pin")
	return { net: firstNet.index, pin: firstPin }
}
