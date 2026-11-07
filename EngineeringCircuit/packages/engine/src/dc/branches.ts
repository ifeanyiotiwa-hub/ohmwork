import type { Component, ComponentType } from "@engineering-circuit/format"
import { acVoltage, squareVoltage } from "../transient/waveforms"

type Pins = [first: string, second: string]

export type Branch = { componentId: string; pins: Pins } & (
	| { kind: "resistor"; resistance: number }
	| { kind: "voltage"; voltage: number }
	/** `test`: a meter's test current, dropped (the meter reads open) when nothing connects its pins. */
	| { kind: "current"; current: number; test?: true }
)

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
	"inductor",
	"ac-source",
	"square-source",
])

/** Parts that carry state from one time step to the next. */
export const STATEFUL_TYPES: ReadonlySet<ComponentType> = new Set(["capacitor", "inductor"])

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
const companion = (componentId: string, conductance: number, injected: number): Branch[] => [
	{ kind: "resistor", componentId, pins: ["a", "b"], resistance: 1 / conductance },
	{ kind: "current", componentId, pins: ["a", "b"], current: injected },
]

const AT_REST: StoredState = { voltage: 0, current: 0 }

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
	capacitor: ({ id, params }, { transient }) => {
		if (!transient) return []
		const previous = transient.memory[id]
		if (!previous) {
			const conductance = params.capacitance / transient.timeStep
			return companion(id, conductance, conductance * AT_REST.voltage)
		}
		const conductance = (2 * params.capacitance) / transient.timeStep
		return companion(id, conductance, conductance * previous.voltage + previous.current)
	},
	inductor: ({ id, params }, { transient }) => {
		if (!transient) return [wire(id)]
		const previous = transient.memory[id]
		if (!previous) return companion(id, transient.timeStep / params.inductance, -AT_REST.current)
		const conductance = transient.timeStep / (2 * params.inductance)
		return companion(id, conductance, -(previous.current + conductance * previous.voltage))
	},
	switch: ({ id, params }) => (params.closed ? [wire(id)] : []),
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
