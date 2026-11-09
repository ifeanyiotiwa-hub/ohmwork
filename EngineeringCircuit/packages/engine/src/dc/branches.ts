import { type Component, type ComponentType, RGB_COLOURS, SEGMENT_PINS } from "@engineering-circuit/format"
import type { LogicMemories } from "../digital/advance"
import { LOGIC_PARTS, type LogicPart, initialMemory } from "../digital/logic"
import { bipolarDevice } from "../nonlinear/bipolar"
import { dcMotorDevice } from "../nonlinear/dc-motor"
import type { Device } from "../nonlinear/device"
import { diodeDevice } from "../nonlinear/diode"
import { mosfetDevice } from "../nonlinear/mosfet"
import { opAmpDevice } from "../nonlinear/op-amp"
import { ADC_4BIT, ADC_8BIT, CONVERTER_4BIT, CONVERTER_8BIT, type Converter, DAC_4BIT, DAC_8BIT, RELAY, TRI_STATE } from "../digital/mixed-parts"
import { TIMER_555 } from "../digital/timer-555"
import { DenseMatrix } from "../linear/dense-matrix"
import { factorLu } from "../linear/lu"
import { acVoltage, squareVoltage } from "../transient/waveforms"

export type Pins = [first: string, second: string]

/**
 * `port`: groups a multi-port part's branches (a transformer's windings) for readings and stored state.
 * `internal`: the port is the part's own working (a MOSFET's gate capacitance): kept between time steps, not shown.
 */
export type Branch = { componentId: string; pins: Pins; port?: string; internal?: true } & (
	| { kind: "resistor"; resistance: number }
	/** `sense`: a 0 V branch whose current a CCVS / CCCS of the same part reads. */
	| { kind: "voltage"; voltage: number; sense?: true }
	/** `test`: a meter's test current, dropped (the meter reads open) when nothing connects its pins. */
	| { kind: "current"; current: number; test?: true }
	/** Controlled sources (SPICE E, G, H, F). Output current kinds push it out of `pins[0]`, like `current`. */
	| { kind: "vcvs"; gain: number; control: Pins }
	| { kind: "vccs"; transconductance: number; control: Pins }
	| { kind: "ccvs"; transresistance: number }
	| { kind: "cccs"; gain: number }
	/** A non-linear part, solved by Newton–Raphson; `pins` are its first two terminals. */
	| { kind: "device"; device: Device }
)

/** Branches that fix a voltage (and carry an unknown current in the equations). */
export const VOLTAGE_KINDS: ReadonlySet<Branch["kind"]> = new Set(["voltage", "vcvs", "ccvs"])
/** Branches that push a set current, so they don't conduct on their own. */
export const CURRENT_KINDS: ReadonlySet<Branch["kind"]> = new Set(["current", "vccs", "cccs"])

/** What the learner is doing right now that isn't saved in the file, e.g. holding a push button. */
export type DcInputs = { pressed?: ReadonlySet<string> }

/** A capacitor's or inductor's voltage and current at the end of the previous time step. */
export type StoredState = { voltage: number; current: number }

/**
 * Present only when solving one time step: the time at the end of the step, its length, and stored states.
 * `backwardEuler`: something switched since the last step, so this step uses backward Euler (as SPICE does at a
 * breakpoint); the trapezoidal rule would make an inductor's suddenly cut current ring from step to step.
 */
export type TransientContext = {
	time: number
	timeStep: number
	memory: Readonly<Record<string, StoredState>>
	backwardEuler?: boolean
}

/**
 * `guess`: pin voltages (keyed "R1:a") to start Newton–Raphson from, e.g. the previous time step's.
 * `logic`: each logic part's present outputs (they change between solves, never within one).
 */
export type SolveInputs = DcInputs & {
	transient?: TransientContext
	guess?: Readonly<Record<string, number>>
	logic?: LogicMemories
}

/** What a part model sees: the solve inputs plus the circuit's logic-high voltage. */
export type ModelContext = SolveInputs & { logicHigh: number; temperature: number }

/** Stands for the circuit's ground in a branch's pins: logic parts and rails are referenced to it. */
export const GROUND_PIN = "@ground"

/** Parts whose behaviour depends on time; a circuit without any is the same at every instant. */
export const TIME_DEPENDENT_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>([
	"clock",
	"dc-motor",
	"timer-555",
	"scope-probe",
	"adc-4bit",
	"dac-4bit",
	"adc-8bit",
	"dac-8bit",
	"relay",
	...(Object.keys(LOGIC_PARTS) as ComponentType[]),
	"capacitor",
	"polarized-capacitor",
	"inductor",
	"transformer",
	"tapped-transformer",
	"ac-source",
	"square-source",
])

/** Parts that carry state from one time step to the next (multi-port ones per port, keyed "T1/primary"). */
export const STATEFUL_TYPES: ReadonlySet<ComponentType> = new Set([
	"capacitor",
	"dc-motor",
	"polarized-capacitor",
	"inductor",
	"transformer",
	"tapped-transformer",
	"relay",
	"op-amp",
	"npn-transistor",
	"pnp-transistor",
	"n-mosfet",
	"p-mosfet",
])

/** A typical multimeter test current; the ohmmeter reads voltage ÷ this (CircuitJS1's OhmMeterElm works the same way). */
export const OHMMETER_TEST_CURRENT = 1e-3

type DcModel<Type extends ComponentType> =
	| ((component: Extract<Component, { type: Type }>, context: ModelContext) => Branch[])
	| "not-simulated"

const wire = (componentId: string, pins: Pins = ["a", "b"]): Branch => ({ kind: "voltage", componentId, pins, voltage: 0 })

/**
 * Companion model (as in CircuitJS1 and SPICE): over one step a capacitor or inductor acts as a conductance in
 * parallel with a current source set by the previous step. `injected` is the current that source pushes into
 * pin a. A part's first step uses backward Euler, like SPICE after a breakpoint: its starting current is
 * unknown (a capacitor jumps from 0 A when power arrives), and trapezoidal steps would carry that error on.
 */
const companion = (componentId: string, conductance: number, injected: number, pins: Pins = ["a", "b"]): Branch[] => [
	{ kind: "resistor", componentId, pins, resistance: 1 / conductance },
	{ kind: "current", componentId, pins, current: injected },
]

const AT_REST: StoredState = { voltage: 0, current: 0 }

/** `port`: for a capacitance inside a part (a MOSFET's gate), whose state is kept as that port ("M1/gate-source-capacitance"). */
function capacitorModel(id: string, capacitance: number, pins: Pins, transient: TransientContext | undefined, port?: string): Branch[] {
	if (!transient || capacitance === 0) return []
	const previous = transient.memory[port ? `${id}/${port}` : id]
	const branches = (() => {
		if (!previous || transient.backwardEuler) {
			const conductance = capacitance / transient.timeStep
			return companion(id, conductance, conductance * (previous ?? AT_REST).voltage, pins)
		}
		const conductance = (2 * capacitance) / transient.timeStep
		return companion(id, conductance, conductance * previous.voltage + previous.current, pins)
	})()
	return port ? branches.map((branch): Branch => ({ ...branch, port, internal: true })) : branches
}

/** A transistor's temperature, and over time the charges its junctions held at the end of the last step. */
const bipolarOptions = (id: string, { temperature, transient }: ModelContext) => {
	if (!transient) return { temperature }
	const stored = transient.memory[`${id}/charge`]
	return { temperature, step: { timeStep: transient.timeStep, previousCharges: [stored?.voltage ?? 0, stored?.current ?? 0] as const } }
}

/** A MOSFET's gate capacitances (to source, and the Miller one to drain), as capacitors inside the part. */
const gateCapacitances = (
	id: string,
	{ gateSourceCapacitance, gateDrainCapacitance }: { gateSourceCapacitance: number; gateDrainCapacitance: number },
	transient: TransientContext | undefined,
): Branch[] => [
	...capacitorModel(id, gateSourceCapacitance, ["gate", "source"], transient, "gate-source-capacitance"),
	...capacitorModel(id, gateDrainCapacitance, ["gate", "drain"], transient, "gate-drain-capacitance"),
]

/** A resistance that may be zero (a potentiometer at its end stop) is a plain wire there. */
const segment = (componentId: string, pins: Pins, resistance: number): Branch =>
	resistance === 0 ? { kind: "voltage", componentId, pins, voltage: 0 } : { kind: "resistor", componentId, pins, resistance }

const deviceBranch = (componentId: string, device: Device, port?: string): Branch => {
	const [first = "", second = ""] = device.terminals
	return port === undefined
		? { kind: "device", componentId, pins: [first, second], device }
		: { kind: "device", componentId, pins: [first, second], device, port }
}

/** An ADC's data pins held at its last code: each bit a source to ground. */
const adcBranches = (id: string, shape: Converter, bits: readonly boolean[], logicHigh: number): Branch[] =>
	shape.pins.map((pin, index) => toGround(id, pin, bits[index] ? logicHigh : 0))

/** out = code × V(vref) / maxCode, a VCVS from vref so the output follows the reference within the solve. */
const dacBranch = (id: string, shape: Converter, code: number): Branch => ({
	kind: "vcvs",
	componentId: id,
	pins: ["out", GROUND_PIN],
	control: ["vref", GROUND_PIN],
	gain: code / shape.maxCode,
})

const toGround = (componentId: string, pin: string, voltage: number): Branch => ({
	kind: "voltage",
	componentId,
	pins: [pin, GROUND_PIN],
	voltage,
})

/**
 * A disabled tri-state output's leakage: SN74HC125 I_OZ, ±0.01 µA typical at 6 V. It is what lets a line no output
 * drives read 0 V (or follow a pull-up) instead of floating.
 */
const OFF_STATE_RESISTANCE = 6 / 0.01e-6

/** Each output pin is an ideal source to ground at 0 V or logic high (CircuitJS1 GateElm). */
const logicModel =
	(part: LogicPart) =>
	({ id }: Component, { logic, logicHigh }: ModelContext): Branch[] => {
		const outputs = logic?.[id]?.outputs ?? initialMemory(part).outputs
		return part.outputs.map((pin, index) => toGround(id, pin, outputs[index] ? logicHigh : 0))
	}

const COIL: Pins = ["coilA", "coilB"]

/**
 * A coil's resistance and inductance in series, as one branch pair (circuits have no internal nodes):
 * v = R·i + L·di/dt, stepped trapezoidally (backward Euler on the first step); at DC just R.
 */
function seriesCoil(id: string, resistance: number, inductance: number, transient: TransientContext | undefined): Branch[] {
	if (!transient) return [{ kind: "resistor", componentId: id, pins: COIL, resistance, port: "coil" }]
	const previous = transient.memory[`${id}/coil`]
	const trapezoidal = previous !== undefined && !transient.backwardEuler
	const reactance = (trapezoidal ? 2 : 1) * (inductance / transient.timeStep)
	const conductance = 1 / (resistance + reactance)
	const before = previous ?? AT_REST
	const history = trapezoidal
		? conductance * (before.voltage - (resistance - reactance) * before.current)
		: conductance * reactance * before.current
	return [
		{ kind: "resistor", componentId: id, pins: COIL, resistance: 1 / conductance, port: "coil" },
		{ kind: "current", componentId: id, pins: COIL, current: -history, port: "coil" },
	]
}

const PRIMARY: Pins = ["primaryA", "primaryB"]
const SECONDARY: Pins = ["secondaryA", "secondaryB"]

type Winding = { port: string; pins: Pins; inductance: number }

/**
 * Coupled inductors (SPICE L + K, every pair coupled by k): v = L di/dt with L[i][i] = Lᵢ and L[i][j] = k√(Lᵢ·Lⱼ).
 * Over one step each winding's current is i = Γ·v + history with Γ = (Δt/2)·L⁻¹ (trapezoidal; Δt·L⁻¹ for the first
 * step and while settling): a conductance per winding, a VCCS per cross term, and a history current source per
 * winding. At DC every winding is a wire.
 */
function coupledWindings(id: string, windings: readonly Winding[], coupling: number, transient: TransientContext | undefined): Branch[] {
	if (!transient) return windings.map(({ port, pins }) => ({ kind: "voltage", componentId: id, pins, voltage: 0, port }))

	const inductance = DenseMatrix.fromRows(
		windings.map((row, i) => windings.map((column, j) => (i === j ? row.inductance : coupling * Math.sqrt(row.inductance * column.inductance)))),
	)
	const factors = factorLu(inductance)
	// 0 < k < 1 (the format's rule) keeps the matrix invertible.
	if (!factors) throw new Error(`${id}: coupled windings with a singular inductance matrix`)
	const inverseColumns = windings.map((_, j) => factors.solve(windings.map((_, i) => (i === j ? 1 : 0))))

	const previous = windings.map(({ port }) => transient.memory[`${id}/${port}`])
	const firstStep = previous.some((state) => !state) || transient.backwardEuler === true
	const scale = firstStep ? transient.timeStep : transient.timeStep / 2
	const gamma = (i: number, j: number) => scale * (inverseColumns[j]?.[i] ?? 0)
	const before = previous.map((state) => state ?? AT_REST)

	return windings.flatMap(({ port, pins }, i): Branch[] => {
		const history =
			(before[i]?.current ?? 0) + (firstStep ? 0 : windings.reduce((sum, _, j) => sum + gamma(i, j) * (before[j]?.voltage ?? 0), 0))
		return [
			{ kind: "resistor", componentId: id, pins, resistance: 1 / gamma(i, i), port },
			...windings.flatMap((other, j): Branch[] =>
				j === i ? [] : [{ kind: "vccs", componentId: id, pins, control: other.pins, transconductance: -gamma(i, j), port }],
			),
			{ kind: "current", componentId: id, pins, current: -history, port },
		]
	})
}

type TransformerParams = { primaryInductance: number; turnsRatio: number; coupling: number }

/** Primary and secondary; the secondary has n times the turns, so n² times the inductance. */
const transformerModel = (id: string, { primaryInductance, turnsRatio, coupling }: TransformerParams, transient: TransientContext | undefined) =>
	coupledWindings(
		id,
		[
			{ port: "primary", pins: PRIMARY, inductance: primaryInductance },
			{ port: "secondary", pins: SECONDARY, inductance: primaryInductance * turnsRatio ** 2 },
		],
		coupling,
		transient,
	)

/** A centre tap splits the secondary into two halves of n/2 turns each, wound the same way, all coupled by k. */
const tappedTransformerModel = (
	id: string,
	{ primaryInductance, turnsRatio, coupling }: TransformerParams,
	transient: TransientContext | undefined,
) => {
	const half = primaryInductance * (turnsRatio / 2) ** 2
	return coupledWindings(
		id,
		[
			{ port: "primary", pins: PRIMARY, inductance: primaryInductance },
			{ port: "secondaryA", pins: ["secondaryA", "secondaryTap"], inductance: half },
			{ port: "secondaryB", pins: ["secondaryTap", "secondaryB"], inductance: half },
		],
		coupling,
		transient,
	)
}

export const DC_MODELS: { [Type in ComponentType]: DcModel<Type> } = {
	ground: () => [],
	"voltage-source": ({ id, params }) => [
		{ kind: "voltage", componentId: id, pins: ["positive", "negative"], voltage: params.voltage },
	],
	"current-source": ({ id, params }) => [
		{ kind: "current", componentId: id, pins: ["positive", "negative"], current: params.current },
	],
	"ac-source": ({ id, params }, { transient }) => [
		{
			kind: "voltage",
			componentId: id,
			pins: ["positive", "negative"],
			voltage: transient ? acVoltage(params, transient.time) : params.offset,
		},
	],
	"square-source": ({ id, params }, { transient }) => [
		{
			kind: "voltage",
			componentId: id,
			pins: ["positive", "negative"],
			voltage: transient ? squareVoltage(params, transient.time) : params.low,
		},
	],
	resistor: ({ id, params }) => [{ kind: "resistor", componentId: id, pins: ["a", "b"], resistance: params.resistance }],
	// Only a node: its wires meet there.
	junction: () => [],
	// Joins its node to every same-named label (buildNets); it carries nothing itself.
	"net-label": () => [],
	// At DC a capacitor is an open gap and an inductor a plain wire; over time they follow i = C dv/dt, v = L di/dt.
	capacitor: ({ id, params }, { transient }) => capacitorModel(id, params.capacitance, ["a", "b"], transient),
	"polarized-capacitor": ({ id, params }, { transient }) =>
		capacitorModel(id, params.capacitance, ["positive", "negative"], transient),
	inductor: ({ id, params }, { transient }) => {
		if (!transient) return [wire(id)]
		const previous = transient.memory[id]
		if (!previous || transient.backwardEuler) {
			return companion(id, transient.timeStep / params.inductance, -(previous ?? AT_REST).current)
		}
		const conductance = transient.timeStep / (2 * params.inductance)
		return companion(id, conductance, -(previous.current + conductance * previous.voltage))
	},
	potentiometer: ({ id, params }) => [
		segment(id, ["a", "wiper"], params.resistance * params.position),
		segment(id, ["wiper", "b"], params.resistance * (1 - params.position)),
	],
	// Enabled: its level through its output resistance (a Norton source: the resistance to ground and level / R into
	// the pin). Disabled: only its leakage. Both as port "output", whose current the burn-out check reads.
	"tri-state-buffer": ({ id, params }, { logic, logicHigh }) => {
		const [level = false, enabled = false] = (logic?.[id] ?? TRI_STATE.initial()).outputs
		const resistance = enabled ? params.outputResistance : OFF_STATE_RESISTANCE
		const toLine = { componentId: id, pins: ["out", GROUND_PIN] as Pins, port: "output" }
		return [
			{ kind: "resistor", ...toLine, resistance },
			...(enabled && level ? [{ kind: "current" as const, ...toLine, current: logicHigh / resistance }] : []),
		]
	},
	"dc-motor": ({ id, params }, { transient }) => {
		const motion = transient?.memory[`${id}/motion`]
		const step = transient && { timeStep: transient.timeStep, previousSpeed: motion?.voltage ?? 0, previousCurrent: motion?.current ?? 0 }
		return [deviceBranch(id, dcMotorDevice(params, step))]
	},
	lamp: ({ id, params }) => [
		{ kind: "resistor", componentId: id, pins: ["a", "b"], resistance: params.ratedVoltage ** 2 / params.ratedPower },
	],
	transformer: ({ id, params }, { transient }) => transformerModel(id, params, transient),
	"tapped-transformer": ({ id, params }, { transient }) => tappedTransformerModel(id, params, transient),
	vcvs: ({ id, params }) => [
		{ kind: "vcvs", componentId: id, pins: ["positive", "negative"], control: ["controlPositive", "controlNegative"], gain: params.gain, port: "output" },
	],
	vccs: ({ id, params }) => [
		{
			kind: "vccs",
			componentId: id,
			pins: ["positive", "negative"],
			control: ["controlPositive", "controlNegative"],
			transconductance: params.transconductance,
			port: "output",
		},
	],
	ccvs: ({ id, params }) => [
		{ kind: "voltage", componentId: id, pins: ["senseIn", "senseOut"], voltage: 0, sense: true, port: "sense" },
		{ kind: "ccvs", componentId: id, pins: ["positive", "negative"], transresistance: params.transresistance, port: "output" },
	],
	cccs: ({ id, params }) => [
		{ kind: "voltage", componentId: id, pins: ["senseIn", "senseOut"], voltage: 0, sense: true, port: "sense" },
		{ kind: "cccs", componentId: id, pins: ["positive", "negative"], gain: params.gain, port: "output" },
	],
	switch: ({ id, params }) => (params.closed ? [wire(id)] : []),
	"switch-spdt": ({ id, params }) => [wire(id, ["common", params.position])],
	"push-button": ({ id, params }, { pressed }) => (params.normallyOpen === (pressed?.has(id) ?? false) ? [wire(id)] : []),
	diode: ({ id, params }, { temperature }) => [deviceBranch(id, diodeDevice({ ...params, temperature }, "anode", "cathode"))],
	"zener-diode": ({ id, params }, { temperature }) => [deviceBranch(id, diodeDevice({ ...params, temperature }, "anode", "cathode"))],
	led: ({ id, params }) => [deviceBranch(id, diodeDevice(params, "anode", "cathode"))],
	"rgb-led": ({ id, params }) =>
		RGB_COLOURS.map((colour) => {
			const model = {
				saturationCurrent: params[`${colour}SaturationCurrent`],
				emissionCoefficient: params.emissionCoefficient,
				seriesResistance: params.seriesResistance,
			}
			return deviceBranch(id, params.commonCathode ? diodeDevice(model, colour, "common") : diodeDevice(model, "common", colour), colour)
		}),
	// Eight LEDs sharing the common pin; each segment's current is reported as a port ("SEG1/a").
	"seven-segment-led": ({ id, params }) =>
		SEGMENT_PINS.map((segment) =>
			deviceBranch(id, params.commonCathode ? diodeDevice(params, segment, "common") : diodeDevice(params, "common", segment), segment),
		),
	"npn-transistor": ({ id, params }, context) => [deviceBranch(id, bipolarDevice(params, 1, bipolarOptions(id, context)))],
	"pnp-transistor": ({ id, params }, context) => [deviceBranch(id, bipolarDevice(params, -1, bipolarOptions(id, context)))],
	"n-mosfet": ({ id, params }, { transient }) => [deviceBranch(id, mosfetDevice(params, 1)), ...gateCapacitances(id, params, transient)],
	"p-mosfet": ({ id, params }, { transient }) => [deviceBranch(id, mosfetDevice(params, -1)), ...gateCapacitances(id, params, transient)],
	"voltage-rail": ({ id, params }) => [toGround(id, "terminal", params.voltage)],
	"logic-input": ({ id, params }, { logicHigh }) => [toGround(id, "out", params.high ? logicHigh : 0)],
	"logic-output": () => [],
	clock: ({ id, params }, { transient, logicHigh }) => [
		toGround(id, "out", transient ? squareVoltage({ ...params, low: 0, high: logicHigh }, transient.time) : 0),
	],
	"not-gate": logicModel(LOGIC_PARTS["not-gate"]),
	"and-gate": logicModel(LOGIC_PARTS["and-gate"]),
	"or-gate": logicModel(LOGIC_PARTS["or-gate"]),
	"nand-gate": logicModel(LOGIC_PARTS["nand-gate"]),
	"nor-gate": logicModel(LOGIC_PARTS["nor-gate"]),
	"xor-gate": logicModel(LOGIC_PARTS["xor-gate"]),
	"xnor-gate": logicModel(LOGIC_PARTS["xnor-gate"]),
	"and-gate-3": logicModel(LOGIC_PARTS["and-gate-3"]),
	"and-gate-4": logicModel(LOGIC_PARTS["and-gate-4"]),
	"or-gate-3": logicModel(LOGIC_PARTS["or-gate-3"]),
	"or-gate-4": logicModel(LOGIC_PARTS["or-gate-4"]),
	"nand-gate-3": logicModel(LOGIC_PARTS["nand-gate-3"]),
	"nand-gate-4": logicModel(LOGIC_PARTS["nand-gate-4"]),
	"nor-gate-3": logicModel(LOGIC_PARTS["nor-gate-3"]),
	"nor-gate-4": logicModel(LOGIC_PARTS["nor-gate-4"]),
	"sr-latch": logicModel(LOGIC_PARTS["sr-latch"]),
	"sr-latch-inverted": logicModel(LOGIC_PARTS["sr-latch-inverted"]),
	"d-flip-flop": logicModel(LOGIC_PARTS["d-flip-flop"]),
	"t-flip-flop": logicModel(LOGIC_PARTS["t-flip-flop"]),
	"jk-flip-flop": logicModel(LOGIC_PARTS["jk-flip-flop"]),
	"counter-4bit": logicModel(LOGIC_PARTS["counter-4bit"]),
	"op-amp": ({ id, params }, { transient }) => [
		deviceBranch(
			id,
			opAmpDevice(
				params,
				GROUND_PIN,
				transient ? { timeStep: transient.timeStep, previousDrive: transient.memory[`${id}/drive`]?.voltage ?? 0 } : undefined,
			),
		),
	],
	// CircuitJS1 TimerElm: 5 kΩ / 10 kΩ divider puts control at ⅔ vcc; output through 1 Ω to vcc or ground;
	// while the output is low, discharge is pulled to ground through 10 Ω. The latch is in digital/timer-555.ts.
	"timer-555": ({ id }, { logic }) => {
		const high = (logic?.[id] ?? TIMER_555.initial()).outputs[0] ?? true
		const resistor = (pins: Pins, resistance: number): Branch => ({ kind: "resistor", componentId: id, pins, resistance })
		return [
			resistor(["vcc", "control"], 5000),
			resistor(["control", "ground"], 10000),
			high ? resistor(["vcc", "output"], 1) : resistor(["output", "ground"], 1),
			...(high ? [] : [resistor(["discharge", "ground"], 10)]),
		]
	},
	"scope-probe": () => [],
	"seven-segment": () => [],
	"bcd-to-seven-segment": logicModel(LOGIC_PARTS["bcd-to-seven-segment"]),
	"adc-4bit": ({ id }, context) => adcBranches(id, CONVERTER_4BIT, (context.logic?.[id] ?? ADC_4BIT.initial()).outputs, context.logicHigh),
	"adc-8bit": ({ id }, context) => adcBranches(id, CONVERTER_8BIT, (context.logic?.[id] ?? ADC_8BIT.initial()).outputs, context.logicHigh),
	"dac-4bit": ({ id }, { logic }) => [dacBranch(id, CONVERTER_4BIT, (logic?.[id] ?? DAC_4BIT.initial()).state.value)],
	"dac-8bit": ({ id }, { logic }) => [dacBranch(id, CONVERTER_8BIT, (logic?.[id] ?? DAC_8BIT.initial()).state.value)],
	relay: ({ id, params }, { logic, transient }) => {
		const pulledIn = (logic?.[id] ?? RELAY.initial()).outputs[0] ?? false
		return [...seriesCoil(id, params.coilResistance, params.coilInductance, transient), wire(id, ["common", pulledIn ? "normallyOpen" : "normallyClosed"])]
	},
	voltmeter: () => [],
	ammeter: ({ id }) => [wire(id, ["positive", "negative"])],
	ohmmeter: ({ id }) => [{ kind: "current", componentId: id, pins: ["a", "b"], current: OHMMETER_TEST_CURRENT, test: true }],
}

export function dcModelOf(component: Component): DcModel<ComponentType> {
	return DC_MODELS[component.type] as DcModel<ComponentType>
}

export const isDcSimulated = (type: ComponentType): boolean => DC_MODELS[type] !== "not-simulated"
