import type { Component, ComponentType } from "@engineering-circuit/format"

type Pins = [first: string, second: string]

export type Branch = { componentId: string; pins: Pins } & (
	| { kind: "resistor"; resistance: number }
	| { kind: "voltage"; voltage: number }
	/** `test`: a meter's test current, dropped (the meter reads open) when nothing connects its pins. */
	| { kind: "current"; current: number; test?: true }
)

/** What the learner is doing right now that isn't saved in the file, e.g. holding a push button. */
export type DcInputs = { pressed?: ReadonlySet<string> }

/** A typical multimeter test current; the ohmmeter reads voltage ÷ this (CircuitJS1's OhmMeterElm works the same way). */
export const OHMMETER_TEST_CURRENT = 1e-3

type DcModel<Type extends ComponentType> =
	| ((component: Extract<Component, { type: Type }>, inputs: DcInputs) => Branch[])
	| "not-simulated"

const wire = (componentId: string, pins: Pins = ["a", "b"]): Branch => ({ kind: "voltage", componentId, pins, voltage: 0 })

export const DC_MODELS: { [Type in ComponentType]: DcModel<Type> } = {
	ground: () => [],
	"voltage-source": ({ id, params }) => [
		{ kind: "voltage", componentId: id, pins: ["positive", "negative"], voltage: params.voltage },
	],
	"current-source": ({ id, params }) => [
		{ kind: "current", componentId: id, pins: ["positive", "negative"], current: params.current },
	],
	resistor: ({ id, params }) => [{ kind: "resistor", componentId: id, pins: ["a", "b"], resistance: params.resistance }],
	capacitor: () => [],
	inductor: ({ id }) => [wire(id)],
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
