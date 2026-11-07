import type { Component, ComponentType } from "@engineering-circuit/format"
import { acVoltage, squareVoltage } from "../transient/waveforms"

export type Pins = [first: string, second: string]

/** `port`: groups a multi-port part's branches (a transformer's windings) for readings and stored state. */
export type Branch = { componentId: string; pins: Pins; port?: string } & (
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
)

/** Branches that fix a voltage (and carry an unknown current in the equations). */
export const VOLTAGE_KINDS: ReadonlySet<Branch["kind"]> = new Set(["voltage", "vcvs", "ccvs"])
/** Branches that push a set current, so they don't conduct on their own. */
export const CURRENT_KINDS: ReadonlySet<Branch["kind"]> = new Set(["current", "vccs", "cccs"])

/** What the learner is doing right now that isn't saved in the file, e.g. holding a push button. */
export type DcInputs = { pressed?: ReadonlySet<string> }

/** A capacitor's or inductor's voltage and current at the end of the previous time step. */
export type StoredState = { voltage: number; current: number }

/** Present only when solving one time step: the time at the end of the step, its length, and stored states. */
export type TransientContext = { time: number; timeStep: number; memory: Readonly<Record<string, StoredState>> }

export type SolveInputs = DcInputs & { transient?: TransientContext }

/** Parts whose behaviour depends on time; a circuit without any is the same at every instant. */
export const TIME_DEPENDENT_TYPES: ReadonlySet<ComponentType> = new Set([
	"capacitor",
	"polarized-capacitor",
	"inductor",
	"transformer",
	"ac-source",
	"square-source",
])

/** Parts that carry state from one time step to the next (multi-port ones per port, keyed "T1/primary"). */
export const STATEFUL_TYPES: ReadonlySet<ComponentType> = new Set(["capacitor", "polarized-capacitor", "inductor", "transformer"])

/** A typical multimeter test current; the ohmmeter reads voltage ÷ this (CircuitJS1's OhmMeterElm works the same way). */
export const OHMMETER_TEST_CURRENT = 1e-3

type DcModel<Type extends ComponentType> =
	| ((component: Extract<Component, { type: Type }>, inputs: SolveInputs) => Branch[])
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

function capacitorModel(id: string, capacitance: number, pins: Pins, transient: TransientContext | undefined): Branch[] {
	if (!transient) return []
	const previous = transient.memory[id]
	if (!previous) {
		const conductance = capacitance / transient.timeStep
		return companion(id, conductance, conductance * AT_REST.voltage, pins)
	}
	const conductance = (2 * capacitance) / transient.timeStep
	return companion(id, conductance, conductance * previous.voltage + previous.current, pins)
}

/** A resistance that may be zero (a potentiometer at its end stop) is a plain wire there. */
const segment = (componentId: string, pins: Pins, resistance: number): Branch =>
	resistance === 0 ? { kind: "voltage", componentId, pins, voltage: 0 } : { kind: "resistor", componentId, pins, resistance }

const PRIMARY: Pins = ["primaryA", "primaryB"]
const SECONDARY: Pins = ["secondaryA", "secondaryB"]

/**
 * Coupled inductors (SPICE L + K): v = L di/dt with L = [[L1, M], [M, L2]], L2 = L1·n², M = k√(L1·L2).
 * Over one step each winding's current is i = Γ·v + history with Γ = (Δt/2)·L⁻¹ (trapezoidal; Δt·L⁻¹ for the
 * first step): a conductance per winding, a VCCS per cross term, and a history current source per winding.
 * At DC both windings are wires.
 */
function transformerModel(
	id: string,
	{ primaryInductance, turnsRatio, coupling }: { primaryInductance: number; turnsRatio: number; coupling: number },
	transient: TransientContext | undefined,
): Branch[] {
	if (!transient) {
		return [
			{ kind: "voltage", componentId: id, pins: PRIMARY, voltage: 0, port: "primary" },
			{ kind: "voltage", componentId: id, pins: SECONDARY, voltage: 0, port: "secondary" },
		]
	}
	const primary = primaryInductance
	const secondary = primaryInductance * turnsRatio * turnsRatio
	const mutual = coupling * Math.sqrt(primary * secondary)
	const determinant = primary * secondary - mutual * mutual

	const previousPrimary = transient.memory[`${id}/primary`]
	const previousSecondary = transient.memory[`${id}/secondary`]
	const firstStep = !previousPrimary || !previousSecondary
	const factor = (firstStep ? transient.timeStep : transient.timeStep / 2) / determinant
	const self1 = factor * secondary
	const self2 = factor * primary
	const cross = -factor * mutual
	const before1 = previousPrimary ?? AT_REST
	const before2 = previousSecondary ?? AT_REST
	const history1 = before1.current + (firstStep ? 0 : self1 * before1.voltage + cross * before2.voltage)
	const history2 = before2.current + (firstStep ? 0 : cross * before1.voltage + self2 * before2.voltage)

	return [
		{ kind: "resistor", componentId: id, pins: PRIMARY, resistance: 1 / self1, port: "primary" },
		{ kind: "vccs", componentId: id, pins: PRIMARY, control: SECONDARY, transconductance: -cross, port: "primary" },
		{ kind: "current", componentId: id, pins: PRIMARY, current: -history1, port: "primary" },
		{ kind: "resistor", componentId: id, pins: SECONDARY, resistance: 1 / self2, port: "secondary" },
		{ kind: "vccs", componentId: id, pins: SECONDARY, control: PRIMARY, transconductance: -cross, port: "secondary" },
		{ kind: "current", componentId: id, pins: SECONDARY, current: -history2, port: "secondary" },
	]
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
	// At DC a capacitor is an open gap and an inductor a plain wire; over time they follow i = C dv/dt, v = L di/dt.
	capacitor: ({ id, params }, { transient }) => capacitorModel(id, params.capacitance, ["a", "b"], transient),
	"polarized-capacitor": ({ id, params }, { transient }) =>
		capacitorModel(id, params.capacitance, ["positive", "negative"], transient),
	inductor: ({ id, params }, { transient }) => {
		if (!transient) return [wire(id)]
		const previous = transient.memory[id]
		if (!previous) return companion(id, transient.timeStep / params.inductance, -AT_REST.current)
		const conductance = transient.timeStep / (2 * params.inductance)
		return companion(id, conductance, -(previous.current + conductance * previous.voltage))
	},
	potentiometer: ({ id, params }) => [
		segment(id, ["a", "wiper"], params.resistance * params.position),
		segment(id, ["wiper", "b"], params.resistance * (1 - params.position)),
	],
	lamp: ({ id, params }) => [
		{ kind: "resistor", componentId: id, pins: ["a", "b"], resistance: params.ratedVoltage ** 2 / params.ratedPower },
	],
	transformer: ({ id, params }, { transient }) => transformerModel(id, params, transient),
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
	diode: "not-simulated",
	led: "not-simulated",
	voltmeter: () => [],
	ammeter: ({ id }) => [wire(id, ["positive", "negative"])],
	ohmmeter: ({ id }) => [{ kind: "current", componentId: id, pins: ["a", "b"], current: OHMMETER_TEST_CURRENT, test: true }],
}

export function dcModelOf(component: Component): DcModel<ComponentType> {
	return DC_MODELS[component.type] as DcModel<ComponentType>
}

export const isDcSimulated = (type: ComponentType): boolean => DC_MODELS[type] !== "not-simulated"
