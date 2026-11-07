import { type Circuit, type Net, buildNets, pinKey, pinsOf } from "@engineering-circuit/format"
import { dcModelOf } from "./branches"
import type { SimIssue } from "./issues"
import { type MnaSolution, solveMna } from "./mna"
import { type NetBranch, chooseReferences, conductiveSets, findCurrentWithoutPath, findShortCircuits } from "./topology"

export type ComponentReading = { voltage: number; current: number }

export type DcSolution = {
	pinVoltages: Record<string, number>
	readings: Record<string, ComponentReading>
	warnings: SimIssue[]
}

export type DcResult = { ok: true; solution: DcSolution } | { ok: false; errors: SimIssue[] }

export function solveDc(circuit: Circuit): DcResult {
	const notSimulated = circuit.components
		.filter((component) => dcModelOf(component) === "not-simulated")
		.map((component) => ({
			componentIds: [component.id],
			message: `"${component.id}" (${component.type}) can't be simulated yet.`,
		}))
	if (notSimulated.length > 0) return { ok: false, errors: notSimulated }

	const nets = buildNets(circuit)
	const netOf = netLookup(nets)
	const branches: NetBranch[] = circuit.components
		.flatMap((component) => {
			const model = dcModelOf(component)
			return model === "not-simulated" ? [] : model(component)
		})
		.map((branch) => ({
			...branch,
			nets: [netOf(branch.componentId, branch.pins[0]), netOf(branch.componentId, branch.pins[1])],
		}))

	const conductive = conductiveSets(nets, branches)
	const errors = [...findShortCircuits(nets, branches), ...findCurrentWithoutPath(branches, conductive)]
	if (errors.length > 0) return { ok: false, errors }

	const { referenceNets, warnings } = chooseReferences(circuit, nets, branches, conductive)
	const mna = solveMna(nets.length, referenceNets, branches)
	if (!mna) {
		return { ok: false, errors: [{ componentIds: [], message: "The circuit's equations have no single solution." }] }
	}

	return { ok: true, solution: { ...readingsOf(circuit, nets, branches, mna, netOf), warnings } }
}

function netLookup(nets: readonly Net[]) {
	const netOfPin = new Map(nets.flatMap((net) => net.pins.map((pin) => [pinKey(pin), net.index] as const)))
	return (componentId: string, pin: string): number => {
		const net = netOfPin.get(pinKey({ componentId, pin }))
		if (net === undefined) throw new Error(`Pin "${componentId}:${pin}" is not in any net`)
		return net
	}
}

function readingsOf(
	circuit: Circuit,
	nets: readonly Net[],
	branches: readonly NetBranch[],
	mna: MnaSolution,
	netOf: (componentId: string, pin: string) => number,
): Omit<DcSolution, "warnings"> {
	const voltageAt = (componentId: string, pin: string) => mna.netVoltages[netOf(componentId, pin)] ?? 0

	const currentById = new Map<string, number>()
	branches.forEach((branch, index) => {
		currentById.set(branch.componentId, (currentById.get(branch.componentId) ?? 0) + (mna.branchCurrents[index] ?? 0))
	})

	const pinVoltages = Object.fromEntries(
		nets.flatMap((net) => net.pins.map((pin) => [pinKey(pin), mna.netVoltages[net.index] ?? 0])),
	)

	const readings = Object.fromEntries(
		circuit.components.flatMap((component) => {
			const [first, second, ...rest] = pinsOf(component.type)
			if (!first || !second || rest.length > 0) return []
			const voltage = voltageAt(component.id, first) - voltageAt(component.id, second)
			return [[component.id, { voltage, current: currentById.get(component.id) ?? 0 }]]
		}),
	)

	return { pinVoltages, readings }
}
