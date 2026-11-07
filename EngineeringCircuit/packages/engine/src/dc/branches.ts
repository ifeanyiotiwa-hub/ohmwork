import type { Component, ComponentType } from "@engineering-circuit/format"

type Pins = [first: string, second: string]

export type Branch = { componentId: string; pins: Pins } & (
	| { kind: "resistor"; resistance: number }
	| { kind: "voltage"; voltage: number }
	| { kind: "current"; current: number }
)

type DcModel<Type extends ComponentType> = ((component: Extract<Component, { type: Type }>) => Branch[]) | "not-simulated"

const wire = (componentId: string): Branch => ({ kind: "voltage", componentId, pins: ["a", "b"], voltage: 0 })

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
	diode: "not-simulated",
	led: "not-simulated",
}

export function dcModelOf(component: Component): DcModel<ComponentType> {
	return DC_MODELS[component.type] as DcModel<ComponentType>
}
