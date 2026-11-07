import { type Circuit, type ComponentType, type Net, buildNets, pinKey, pinsOf } from "@engineering-circuit/format"
import type { DisjointSets } from "../graph/disjoint-sets"
import { type DcInputs, OHMMETER_TEST_CURRENT, type SolveInputs, dcModelOf } from "./branches"
import type { SimIssue } from "./issues"
import { type MnaSolution, solveMna } from "./mna"
import { type NetBranch, chooseReferences, conductiveSets, findCurrentWithoutPath, findShortCircuits } from "./topology"

export type { DcInputs } from "./branches"

/** `resistance` is an ohmmeter's reading: Infinity when nothing connects its leads. */
export type ComponentReading = { voltage: number; current: number; resistance?: number }

/** Parts that push energy into the circuit; an ohmmeter sharing a circuit with one can't read resistance. */
const POWERING_TYPES: ReadonlySet<ComponentType> = new Set(["voltage-source", "current-source", "ohmmeter"])

export type DcSolution = {
	pinVoltages: Record<string, number>
	readings: Record<string, ComponentReading>
	warnings: SimIssue[]
}

export type DcResult = { ok: true; solution: DcSolution } | { ok: false; errors: SimIssue[] }

/** The DC steady state: capacitors open, inductors shorted, wave sources at their DC value. */
export function solveDc(circuit: Circuit, inputs: DcInputs = {}): DcResult {
	return solveCircuit(circuit, inputs.pressed ? { pressed: inputs.pressed } : {})
}

/** Solves the circuit once; with `inputs.transient`, that is one time step. */
export function solveCircuit(circuit: Circuit, inputs: SolveInputs): DcResult {
	const notSimulated = circuit.components
		.filter((component) => dcModelOf(component) === "not-simulated")
		.map((component) => ({
			componentIds: [component.id],
			message: `"${component.id}" (${component.type}) can't be simulated yet.`,
		}))
	if (notSimulated.length > 0) return { ok: false, errors: notSimulated }

	const nets = buildNets(circuit)
	const netOf = netLookup(nets)
	const modelled: NetBranch[] = circuit.components
		.flatMap((component) => {
			const model = dcModelOf(component)
			return model === "not-simulated" ? [] : model(component, inputs)
		})
		.map((branch) => ({
			...branch,
			nets: [netOf(branch.componentId, branch.pins[0]), netOf(branch.componentId, branch.pins[1])],
		}))

	const conductive = conductiveSets(nets, modelled)
	const openMeters = new Set(
		modelled
			.filter((branch) => branch.kind === "current" && branch.test && !conductive.connected(...branch.nets))
			.map((branch) => branch.componentId),
	)
	const branches = modelled.filter((branch) => !openMeters.has(branch.componentId))

	const errors = [...findShortCircuits(nets, branches), ...findCurrentWithoutPath(branches, conductive)]
	if (errors.length > 0) return { ok: false, errors }

	const references = chooseReferences(circuit, nets, branches, conductive, (componentIds) =>
		isUnpoweredMeasurement(circuit, componentIds),
	)
	const mna = solveMna(nets.length, references.referenceNets, branches)
	if (!mna) {
		return { ok: false, errors: [{ componentIds: [], message: "The circuit's equations have no single solution." }] }
	}

	const warnings = [...references.warnings, ...poweredOhmmeterWarnings(circuit, branches, conductive)]
	return { ok: true, solution: { ...readingsOf(circuit, nets, branches, mna, netOf, openMeters), warnings } }
}

/** An ohmmeter measuring a passive network needs no ground: its reading is a voltage difference. */
function isUnpoweredMeasurement(circuit: Circuit, componentIds: readonly string[]): boolean {
	const types = circuit.components.filter((component) => componentIds.includes(component.id)).map((part) => part.type)
	return types.includes("ohmmeter") && types.filter((type) => POWERING_TYPES.has(type)).length === 1
}

function poweredOhmmeterWarnings(circuit: Circuit, branches: readonly NetBranch[], conductive: DisjointSets): SimIssue[] {
	const typeOf = new Map(circuit.components.map((component) => [component.id, component.type]))
	const islandOf = (branch: NetBranch) => conductive.find(branch.nets[0])
	const powering = branches.filter((branch) => POWERING_TYPES.has(typeOf.get(branch.componentId) ?? "ground"))
	return branches
		.filter((branch) => typeOf.get(branch.componentId) === "ohmmeter")
		.filter((meter) => powering.some((other) => other.componentId !== meter.componentId && islandOf(other) === islandOf(meter)))
		.map((meter) => ({
			componentIds: [meter.componentId],
			message: `Ohmmeter "${meter.componentId}" is measuring a powered circuit, so its reading is not a resistance. Measure with the power off.`,
		}))
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
	openMeters: ReadonlySet<string>,
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
			const reading: ComponentReading = { voltage, current: currentById.get(component.id) ?? 0 }
			if (component.type === "ohmmeter") {
				reading.resistance = openMeters.has(component.id) ? Number.POSITIVE_INFINITY : voltage / OHMMETER_TEST_CURRENT
			}
			return [[component.id, reading]]
		}),
	)

	return { pinVoltages, readings }
}
