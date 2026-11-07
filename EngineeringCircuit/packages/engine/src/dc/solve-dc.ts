import { type Circuit, type ComponentType, type Net, buildNets, pinKey, pinsOf } from "@engineering-circuit/format"
import type { DisjointSets } from "../graph/disjoint-sets"
import { type DcInputs, OHMMETER_TEST_CURRENT, type SolveInputs, dcModelOf } from "./branches"
import type { SimIssue } from "./issues"
import { type MnaSolution, solveMna, terminalCurrents } from "./mna"
import { type NetBranch, chooseReferences, conductiveSets, findCurrentWithoutPath, findShortCircuits } from "./topology"

export type { DcInputs } from "./branches"

/** `resistance` is an ohmmeter's reading: Infinity when nothing connects its leads. */
export type ComponentReading = { voltage: number; current: number; resistance?: number }

/** Parts that push energy into the circuit; an ohmmeter sharing a circuit with one can't read resistance. */
const POWERING_TYPES: ReadonlySet<ComponentType> = new Set([
	"voltage-source",
	"current-source",
	"ac-source",
	"square-source",
	"vcvs",
	"vccs",
	"ccvs",
	"cccs",
	"ohmmeter",
])

/**
 * `readings`: two-pin parts. `ports`: each port of a multi-port part, keyed "T1/primary" or "E1/output", with the
 * voltage across its two pins and the current into its first pin.
 */
export type DcSolution = {
	pinVoltages: Record<string, number>
	readings: Record<string, ComponentReading>
	ports: Record<string, ComponentReading>
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
		.map((branch): NetBranch => {
			const nets: NetBranch["nets"] = [netOf(branch.componentId, branch.pins[0]), netOf(branch.componentId, branch.pins[1])]
			if (branch.kind === "device") {
				return { ...branch, nets, terminalNets: branch.device.terminals.map((pin) => netOf(branch.componentId, pin)) }
			}
			if (!("control" in branch)) return { ...branch, nets }
			return { ...branch, nets, controlNets: [netOf(branch.componentId, branch.control[0]), netOf(branch.componentId, branch.control[1])] }
		})

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
	const start = nets.map((net) => {
		const pin = net.pins.find((candidate) => inputs.guess?.[pinKey(candidate)] !== undefined)
		return pin ? (inputs.guess?.[pinKey(pin)] ?? 0) : 0
	})
	const solved = solveIterating(nets.length, references.referenceNets, branches, start)
	if (solved.outcome === "singular") {
		return { ok: false, errors: [{ componentIds: [], message: "The circuit's equations have no single solution." }] }
	}
	if (solved.outcome === "unsettled") {
		const componentIds = [...new Set(branches.filter((branch) => branch.kind === "device").map((branch) => branch.componentId))]
		return {
			ok: false,
			errors: [
				{
					componentIds,
					message: `The circuit didn't settle: its diodes and transistors were still changing after ${MAX_ITERATIONS} tries. Look for diodes or transistors with nothing limiting their current.`,
				},
			],
		}
	}
	const { mna } = solved

	const readings = readingsOf(circuit, nets, solved.branches, mna, netOf, openMeters)
	const warnings = [
		...references.warnings,
		...poweredOhmmeterWarnings(circuit, branches, conductive),
		...reversedCapacitorWarnings(circuit, readings.readings),
	]
	return { ok: true, solution: { ...readings, warnings } }
}

/** Newton–Raphson gives up after this many iterations (SPICE's ITL1 is 100; diode-heavy circuits need more). */
const MAX_ITERATIONS = 200
/** SPICE's VNTOL and RELTOL: node voltages have settled when they move less than 1 µV + 0.1%. */
const VOLTAGE_TOLERANCE = 1e-6
const RELATIVE_TOLERANCE = 1e-3

type Solved =
	| { outcome: "solved"; mna: MnaSolution; branches: NetBranch[] }
	| { outcome: "singular" }
	| { outcome: "unsettled" }

/** One linear solve, or Newton–Raphson when there are non-linear devices: linearize, solve, repeat until settled. */
function solveIterating(netCount: number, referenceNets: ReadonlySet<number>, branches: NetBranch[], start: number[]): Solved {
	if (!branches.some((branch) => branch.kind === "device")) {
		const mna = solveMna(netCount, referenceNets, branches)
		return mna ? { outcome: "solved", mna, branches } : { outcome: "singular" }
	}

	const terminalVoltages = (branch: NetBranch, voltages: readonly number[]) =>
		(branch.terminalNets ?? []).map((net) => voltages[net] ?? 0)
	let voltages: readonly number[] = start
	let states = branches.map((branch) => (branch.kind === "device" ? branch.device.initialState(terminalVoltages(branch, voltages)) : []))

	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
		const linearized = branches.map((branch, index): NetBranch => {
			if (branch.kind !== "device") return branch
			return { ...branch, linearization: branch.device.linearize(terminalVoltages(branch, voltages), states[index] ?? []) }
		})
		const mna = solveMna(netCount, referenceNets, linearized)
		if (!mna) return { outcome: "singular" }

		const devicesSettled = linearized.every((branch) => branch.linearization?.settled !== false)
		const voltagesSettled = mna.netVoltages.every(
			(voltage, net) => Math.abs(voltage - (voltages[net] ?? 0)) <= VOLTAGE_TOLERANCE + RELATIVE_TOLERANCE * Math.abs(voltage),
		)
		voltages = mna.netVoltages
		states = linearized.map((branch) => branch.linearization?.state ?? [])
		if (devicesSettled && voltagesSettled) return { outcome: "solved", mna, branches: linearized }
	}
	return { outcome: "unsettled" }
}

const volts = (value: number) => `${Number(value.toPrecision(3))} V`

/** CircuitJS1 stops the simulation past a polarized capacitor's reverse limit; we explain it instead. */
function reversedCapacitorWarnings(circuit: Circuit, readings: Record<string, ComponentReading>): SimIssue[] {
	return circuit.components.flatMap((component) => {
		if (component.type !== "polarized-capacitor") return []
		const reverse = -(readings[component.id]?.voltage ?? 0)
		if (reverse <= component.params.maxReverseVoltage) return []
		return [
			{
				componentIds: [component.id],
				message: `Polarized capacitor "${component.id}" is reversed: its negative pin is ${volts(reverse)} above its positive pin (limit ${volts(component.params.maxReverseVoltage)}). A real one could fail; turn it around.`,
			},
		]
	})
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

	const ports: Record<string, ComponentReading> = {}
	branches.forEach((branch) => {
		if (branch.kind !== "device" || !branch.device.ports) return
		const voltages = (branch.terminalNets ?? []).map((net) => mna.netVoltages[net] ?? 0)
		for (const port of branch.device.ports(voltages, terminalCurrents(branch, mna.netVoltages))) {
			ports[`${branch.componentId}/${port.name}`] = { voltage: port.voltage, current: port.current }
		}
	})
	branches.forEach((branch, index) => {
		if (!branch.port) return
		const key = `${branch.componentId}/${branch.port}`
		const voltage = voltageAt(branch.componentId, branch.pins[0]) - voltageAt(branch.componentId, branch.pins[1])
		ports[key] = { voltage, current: (ports[key]?.current ?? 0) + (mna.branchCurrents[index] ?? 0) }
	})

	return { pinVoltages, readings, ports }
}
