import type { Circuit, Net, PinRef } from "@engineering-circuit/format"
import { DisjointSets } from "../graph/disjoint-sets"
import type { Linearization } from "../nonlinear/device"
import { type Branch, CURRENT_KINDS, VOLTAGE_KINDS } from "./branches"
import type { SimIssue } from "./issues"

/**
 * A branch with its pins resolved to nets, plus a VCVS / VCCS's control nets, or a device's terminal nets and its
 * linearization for the current Newton–Raphson iteration.
 */
export type NetBranch = Branch & {
	nets: [first: number, second: number]
	controlNets?: [first: number, second: number]
	terminalNets?: readonly number[]
	linearization?: Linearization
}

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
		if (!VOLTAGE_KINDS.has(branch.kind) || sourceLoops.union(...branch.nets)) continue
		issues.push({
			componentIds: [branch.componentId],
			message: `Short circuit: "${branch.componentId}" is connected in a loop of voltage sources, closed switches, inductors, ammeters and wires with no resistance.`,
		})
	}
	return issues
}

export function conductiveSets(nets: readonly Net[], branches: readonly NetBranch[]): DisjointSets {
	const sets = groundedSets(nets)
	for (const branch of branches) {
		if (CURRENT_KINDS.has(branch.kind)) continue
		if (branch.kind !== "device") {
			sets.union(...branch.nets)
			continue
		}
		for (const [first, second] of branch.device.conducting) {
			const a = branch.terminalNets?.[first]
			const b = branch.terminalNets?.[second]
			if (a !== undefined && b !== undefined) sets.union(a, b)
		}
	}
	return sets
}

export function findCurrentWithoutPath(branches: readonly NetBranch[], conductive: DisjointSets): SimIssue[] {
	return branches
		.filter((branch) => CURRENT_KINDS.has(branch.kind) && !conductive.connected(...branch.nets))
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
	/**
	 * Islands that need no ground are solved without a warning: an ohmmeter on an unpowered network, or a logic
	 * input left unconnected (it reads 0).
	 */
	needsNoGround: (componentIds: readonly string[], pins: readonly PinRef[]) => boolean = () => false,
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
		if (needsNoGround(componentIds, islandNets.flatMap((net) => net.pins))) continue
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
