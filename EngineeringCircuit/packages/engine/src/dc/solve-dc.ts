import {
	type Circuit,
	type ComponentType,
	type Net,
	type PinRef,
	RGB_COLOURS,
	SEGMENT_PINS,
	buildNets,
	formatSi,
	pinKey,
	pinsOf,
} from "@engineering-circuit/format"
import type { DisjointSets } from "../graph/disjoint-sets"
import { type LogicMemories, advanceLogic, hasLogic, initialMemories, sameOutputs } from "../digital/advance"
import { LOGIC_PARTS, logicPartOf } from "../digital/logic"
import { type DcInputs, GROUND_PIN, OHMMETER_TEST_CURRENT, type SolveInputs, dcModelOf } from "./branches"
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
	"voltage-rail",
	"logic-input",
	"clock",
	"op-amp",
	"timer-555",
	"adc-4bit",
	"dac-4bit",
	...(Object.keys(LOGIC_PARTS) as ComponentType[]),
])

/**
 * `readings`: two-pin parts. `ports`: each port of a multi-port part, keyed "T1/primary" or "E1/output", with the
 * voltage across its two pins and the current into its first pin.
 */
export type DcSolution = {
	pinVoltages: Record<string, number>
	readings: Record<string, ComponentReading>
	ports: Record<string, ComponentReading>
	/** Outputs of logic and switching parts during this solve (a flip-flop's Q, a relay pulled in), by id. */
	states?: Record<string, readonly boolean[]>
	warnings: SimIssue[]
}

export type DcResult = { ok: true; solution: DcSolution } | { ok: false; errors: SimIssue[] }

/** Logic in a DC solve is re-solved until its outputs stop changing; an oscillator never does. */
const MAX_LOGIC_PASSES = 64

/**
 * The DC steady state: capacitors open, inductors shorted, wave sources at their DC value, clocks low. With logic
 * parts, solves repeatedly, feeding each pass's input levels into the next, until no output changes.
 */
export function solveDc(circuit: Circuit, inputs: DcInputs = {}): DcResult {
	const base: SolveInputs = inputs.pressed ? { pressed: inputs.pressed } : {}
	if (!hasLogic(circuit)) return solveCircuit(circuit, base)

	let logic: LogicMemories = initialMemories(circuit)
	for (let pass = 0; pass < MAX_LOGIC_PASSES; pass++) {
		const result = solveCircuit(circuit, { ...base, logic })
		if (!result.ok) return result
		const next = advanceLogic(circuit, result.solution, logic, circuit.simulation.logicHigh)
		if (sameOutputs(next, logic)) return result
		logic = next
	}
	return {
		ok: false,
		errors: [
			{
				componentIds: Object.keys(logic),
				message:
					"The logic keeps changing and never settles (for example a NOT gate feeding itself): it oscillates. Watch it run over time instead.",
			},
		],
	}
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

	const context = { ...inputs, logicHigh: circuit.simulation.logicHigh }
	const raw = circuit.components.flatMap((component) => {
		const model = dcModelOf(component)
		return model === "not-simulated" ? [] : model(component, context)
	})
	const usesGround = raw.some(
		(branch) => branch.pins.includes(GROUND_PIN) || (branch.kind === "device" && branch.device.terminals.includes(GROUND_PIN)),
	)
	const nets = withGround(buildNets(circuit), usesGround)
	const netOf = netLookup(nets)
	const modelled: NetBranch[] = raw
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

	const references = chooseReferences(
		circuit,
		nets,
		branches,
		conductive,
		(componentIds, pins) => isUnpoweredMeasurement(circuit, componentIds) || areOpenInputs(circuit, pins),
	)
	const start = nets.map((net) => {
		const pin = net.pins.find((candidate) => inputs.guess?.[pinKey(candidate)] !== undefined)
		return pin ? (inputs.guess?.[pinKey(pin)] ?? 0) : 0
	})
	const solved = solveIterating(nets.length, references.referenceNets, branches, start)
	if (solved.outcome === "runaway") {
		const names = solved.componentIds.join(", ")
		return {
			ok: false,
			errors: [
				{
					componentIds: solved.componentIds,
					message: `The current through ${names} grows without limit: a source drives it directly, with nothing to limit the current. Add a series resistor.`,
				},
			],
		}
	}
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
		...burnOutWarnings(circuit, readings.readings, readings.ports),
	]
	const states = Object.fromEntries(Object.entries(inputs.logic ?? {}).map(([id, memory]) => [id, memory.outputs]))
	return { ok: true, solution: { ...readings, ...(Object.keys(states).length > 0 ? { states } : {}), warnings } }
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
	| { outcome: "runaway"; componentIds: string[] }

/** Devices whose junctions ran away this iteration (see RUNAWAY_CONDUCTANCE). */
function runawayDevices(branches: readonly NetBranch[]): string[] {
	return [...new Set(branches.filter((branch) => branch.linearization?.runaway).map((branch) => branch.componentId))]
}

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
		const runaway = runawayDevices(linearized)
		if (runaway.length > 0) return { outcome: "runaway", componentIds: runaway }
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

/** A lamp this far over its rated voltage is reported (bulbs tolerate a little over-voltage, at a cost in life). */
const LAMP_OVERVOLTAGE = 1.1

/** Parts pushed past their ratings: what a real one would not survive, said with the numbers. */
/**
 * A transistor or MOSFET over its output-current rating, or turning more than its power rating into heat (output
 * V·I plus, for a transistor, the base drive's V·I).
 */
function overRatings(
	id: string,
	rating: { maxCurrent: number; maxPower: number },
	pin: "collector" | "drain",
	output: ComponentReading | undefined,
	drive: ComponentReading | undefined,
	advice: string,
): SimIssue[] {
	if (!output) return []
	const current = Math.abs(output.current)
	const power = Math.abs(output.voltage * output.current) + Math.abs((drive?.voltage ?? 0) * (drive?.current ?? 0))
	const issue = (actual: string, limit: string): SimIssue => ({
		componentIds: [id],
		message: `${id} ${actual}, but it is rated for ${limit}: a real one would burn out.${advice}`,
		kind: "burn-out",
	})
	return [
		...(current > rating.maxCurrent ? [issue(`carries ${formatSi(current, "A")} into its ${pin}`, formatSi(rating.maxCurrent, "A"))] : []),
		...(power > rating.maxPower ? [issue(`turns ${formatSi(power, "W")} into heat`, formatSi(rating.maxPower, "W"))] : []),
	]
}

function burnOutWarnings(
	circuit: Circuit,
	readings: Record<string, ComponentReading>,
	ports: Record<string, ComponentReading>,
): SimIssue[] {
	const burnsOut = (id: string, actual: string, rating: string, advice: string): SimIssue => ({
		componentIds: [id],
		message: `${id} ${actual}, but it is rated for ${rating}: a real one would burn out.${advice}`,
		kind: "burn-out",
	})
	return circuit.components.flatMap((component): SimIssue[] => {
		if (component.type === "rgb-led") {
			const { id, params } = component
			return RGB_COLOURS.flatMap((colour) => {
				const current = Math.abs(ports[`${id}/${colour}`]?.current ?? 0)
				const rating = params[`${colour}MaxCurrent`]
				return current > rating
					? [burnsOut(id, `${colour} carries ${formatSi(current, "A")}`, formatSi(rating, "A"), " Limit the current with a series resistor.")]
					: []
			})
		}
		if (component.type === "seven-segment-led") {
			const { id, params } = component
			return SEGMENT_PINS.flatMap((segment) => {
				const current = Math.abs(ports[`${id}/${segment}`]?.current ?? 0)
				return current > params.maxCurrent
					? [burnsOut(id, `segment ${segment} carries ${formatSi(current, "A")}`, formatSi(params.maxCurrent, "A"), " Give each segment its own series resistor.")]
					: []
			})
		}
		if (component.type === "npn-transistor" || component.type === "pnp-transistor") {
			const output = ports[`${component.id}/collector-emitter`]
			const drive = ports[`${component.id}/base-emitter`]
			return overRatings(component.id, component.params, "collector", output, drive, " Limit the base drive, or the collector current with a resistor.")
		}
		if (component.type === "n-mosfet" || component.type === "p-mosfet") {
			const output = ports[`${component.id}/drain-source`]
			return overRatings(component.id, component.params, "drain", output, undefined, " Limit the drain current with a resistor.")
		}
		const reading = readings[component.id]
		if (!reading) return []
		const current = Math.abs(reading.current)
		switch (component.type) {
			case "led":
			case "diode":
			case "zener-diode":
				return current > component.params.maxCurrent
					? [
							burnsOut(
								component.id,
								`carries ${formatSi(current, "A")}`,
								formatSi(component.params.maxCurrent, "A"),
								" Limit the current with a series resistor.",
							),
						]
					: []
			case "resistor": {
				const power = Math.abs(reading.voltage * reading.current)
				return power > component.params.powerRating
					? [
							burnsOut(
								component.id,
								`turns ${formatSi(power, "W")} into heat`,
								formatSi(component.params.powerRating, "W"),
								" Use a larger resistance or a higher power rating.",
							),
						]
					: []
			}
			case "lamp": {
				const voltage = Math.abs(reading.voltage)
				return voltage > component.params.ratedVoltage * LAMP_OVERVOLTAGE
					? [burnsOut(component.id, `has ${formatSi(voltage, "V")} across it`, formatSi(component.params.ratedVoltage, "V"), "")]
					: []
			}
			default:
				return []
		}
	})
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

/**
 * Pins that only read a voltage and draw no current, besides logic inputs. Left unconnected they read 0, which is
 * harmless. Op-amp and 555 inputs are left out on purpose: a floating one is a classic mistake worth a warning.
 */
const READ_ONLY_PINS: Partial<Record<ComponentType, readonly string[]>> = {
	"seven-segment": ["a", "b", "c", "d", "e", "f", "g", "dp"],
	"adc-4bit": ["in", "vref"],
	"dac-4bit": ["d0", "d1", "d2", "d3", "vref"],
	"scope-probe": ["positive", "negative"],
	voltmeter: ["positive", "negative"],
}

const readsOnly = (type: ComponentType, pin: string) =>
	(logicPartOf(type)?.inputs.includes(pin) ?? false) || (READ_ONLY_PINS[type]?.includes(pin) ?? false)

/** Pins that are all read-only inputs, connected to nothing that drives them: they read 0. */
function areOpenInputs(circuit: Circuit, pins: readonly PinRef[]): boolean {
	const typeOf = new Map(circuit.components.map((component) => [component.id, component.type]))
	return (
		pins.length > 0 &&
		pins.every((pin) => {
			const type = typeOf.get(pin.componentId)
			return type !== undefined && readsOnly(type, pin.pin)
		})
	)
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

/**
 * Logic parts and rails are referenced to ground. If the circuit has no ground part, an internal ground net is
 * added for them (as EveryCircuit does): it holds 0 V but has no pins.
 */
function withGround(nets: Net[], needed: boolean): Net[] {
	if (!needed || nets.some((net) => net.isGround)) return nets
	return [...nets, { index: nets.length, pins: [], isGround: true }]
}

function netLookup(nets: readonly Net[]) {
	const netOfPin = new Map(nets.flatMap((net) => net.pins.map((pin) => [pinKey(pin), net.index] as const)))
	const groundNet = nets.find((net) => net.isGround)?.index
	return (componentId: string, pin: string): number => {
		if (pin === GROUND_PIN && groundNet !== undefined) return groundNet
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
