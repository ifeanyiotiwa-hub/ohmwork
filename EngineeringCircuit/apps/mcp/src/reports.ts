import type { HistoryItem } from "@engineering-circuit/editing"
import { type ComponentReading, type DcSolution, isDcSimulated, solveDc } from "@engineering-circuit/engine"
import {
	COMPONENT_DEFINITIONS,
	type Circuit,
	type ComponentType,
	type PinRef,
	buildNets,
	definitionOf,
	pinKey,
	pinsOf,
} from "@engineering-circuit/format"
import { z } from "zod"

const SIGNIFICANT_DIGITS = 6

export const CONVENTIONS = [
	"Units are SI: volts (V), amps (A), watts (W), ohms, farads, henries.",
	"A part's current flows into its first pin and out of its second; voltage = first pin minus second pin.",
	"Negative power means the part supplies energy (e.g. a battery driving a load).",
	"Values are the DC steady state: capacitors act as open gaps, inductors as wires.",
]

const rounded = (value: number) => Number(value.toPrecision(SIGNIFICANT_DIGITS)) || 0
const pinLabel = (ref: PinRef) => `${ref.componentId}.${ref.pin}`
const paramsSchemaOf = (type: ComponentType) => z.toJSONSchema(definitionOf(type).schema.shape.params)

export function componentTypesReport() {
	return COMPONENT_DEFINITIONS.map((definition) => ({
		type: definition.type,
		idPrefix: definition.idPrefix,
		pins: definition.pins,
		simulated: isDcSimulated(definition.type),
		defaults: definition.defaults,
		params: paramsSchemaOf(definition.type),
	}))
}

function nodesOf(circuit: Circuit, solution?: DcSolution) {
	let counter = 0
	return buildNets(circuit).map((net) => {
		const name = net.isGround ? "ground" : `N${++counter}`
		const [firstPin] = net.pins
		const voltage = solution && firstPin ? rounded(solution.pinVoltages[pinKey(firstPin)] ?? 0) : undefined
		return { name, ...(voltage === undefined ? {} : { voltage }), pins: net.pins.map(pinLabel) }
	})
}

const readingReport = ({ voltage, current }: ComponentReading) => ({
	voltage: rounded(voltage),
	current: rounded(current),
	power: rounded(voltage * current),
})

export function simulationReport(circuit: Circuit, solution: DcSolution) {
	return {
		nodes: nodesOf(circuit, solution),
		components: circuit.components.flatMap((component) => {
			const reading = solution.readings[component.id]
			return reading ? [{ id: component.id, type: component.type, ...readingReport(reading) }] : []
		}),
		warnings: solution.warnings,
		conventions: CONVENTIONS,
	}
}

export type ProbeTarget = { kind: "component"; componentId: string } | { kind: "pin"; pin: PinRef }

export function findProbeTarget(circuit: Circuit, target: string): ProbeTarget | { error: string } {
	const component = circuit.components.find((candidate) => candidate.id === target)
	if (component) {
		return pinsOf(component.type).length === 2
			? { kind: "component", componentId: component.id }
			: { error: `"${target}" has no single reading; probe one of its pins instead` }
	}

	const separator = target.lastIndexOf(".")
	const componentId = separator > 0 ? target.slice(0, separator) : target
	const pin = target.slice(separator + 1)
	const owner = circuit.components.find((candidate) => candidate.id === componentId)
	if (!owner) return { error: `No component with id "${componentId}"` }
	if (separator <= 0 || !pinsOf(owner.type).includes(pin)) {
		return { error: `${owner.type} "${componentId}" has no pin "${pin}" (valid: ${pinsOf(owner.type).join(", ")})` }
	}
	return { kind: "pin", pin: { componentId, pin } }
}

export function probeReport(solution: DcSolution, target: ProbeTarget) {
	if (target.kind === "pin") {
		return { target: pinLabel(target.pin), voltage: rounded(solution.pinVoltages[pinKey(target.pin)] ?? 0) }
	}
	const reading = solution.readings[target.componentId] ?? { voltage: 0, current: 0 }
	return { target: target.componentId, ...readingReport(reading) }
}

export function explanation(circuit: Circuit, history: HistoryItem[]) {
	const outcome = solveDc(circuit)
	const solution = outcome.ok ? outcome.solution : undefined

	return {
		name: circuit.name,
		description: circuit.description,
		components: circuit.components.map((component) => {
			const properties = paramsSchemaOf(component.type).properties ?? {}
			const params = Object.fromEntries(
				Object.entries(component.params).map(([name, value]) => {
					const property = properties[name]
					const unit = typeof property === "object" ? property.description : undefined
					return [name, unit === undefined ? { value } : { value, unit }]
				}),
			)
			return { id: component.id, type: component.type, params }
		}),
		nodes: nodesOf(circuit, solution),
		simulation: solution
			? { ok: true, readings: simulationReport(circuit, solution).components, warnings: solution.warnings }
			: { ok: false, errors: outcome.ok ? [] : outcome.errors },
		history,
		conventions: CONVENTIONS,
	}
}
