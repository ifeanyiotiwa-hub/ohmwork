import type { HistoryItem } from "@ohmwork/editing"
import { type ComponentReading, type DcSolution, isDcSimulated, solveDc } from "@ohmwork/engine"
import {
	COMPONENT_DEFINITIONS,
	type Circuit,
	type ComponentType,
	PIN_OFFSETS,
	type PinRef,
	type Point,
	buildNets,
	definitionOf,
	pinKey,
	expandSubcircuits,
	isChip,
	pinPosition,
	pinsOfPart,
} from "@ohmwork/format"
import * as z from "zod"

const SIGNIFICANT_DIGITS = 6

export const CONVENTIONS = [
	"Units are SI: volts (V), amps (A), watts (W), ohms, farads, henries.",
	"A part's current flows into its first pin and out of its second; voltage = first pin minus second pin.",
	"Negative power means the part supplies energy (e.g. a battery driving a load).",
	"simulate and probe give the DC steady state: capacitors act as open gaps, inductors as wires, wave sources sit at their DC value (sine: offset; square: low).",
	"simulate_over_time starts from rest: capacitors empty, inductors at 0 A.",
]

const rounded = (value: number) => Number(value.toPrecision(SIGNIFICANT_DIGITS)) || 0
const pinLabel = (ref: PinRef) => `${ref.componentId}.${ref.pin}`
const paramsSchemaOf = (type: ComponentType) => z.toJSONSchema(definitionOf(type).schema.shape.params)

export function componentTypesReport() {
	return COMPONENT_DEFINITIONS.map((definition) => ({
		type: definition.type,
		idPrefix: definition.idPrefix,
		pins: definition.pins,
		pinOffsets: PIN_OFFSETS[definition.type],
		simulated: isDcSimulated(definition.type),
		defaults: definition.defaults,
		params: paramsSchemaOf(definition.type),
	}))
}

/** Where every pin is on the canvas, keyed "R1.a". */
export function pinPositionsReport(circuit: Circuit): Record<string, Point> {
	return Object.fromEntries(
		circuit.components.flatMap((component) =>
			pinsOfPart(component, circuit).map((pin) => [`${component.id}.${pin}`, pinPosition(component, pin, component.position, circuit.subcircuits)]),
		),
	)
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

const OPEN_READING = "open (nothing connects its leads)"

const RPM_PER_RADIAN_PER_SECOND = 60 / (2 * Math.PI)

const readingReport = ({ voltage, current, resistance, speed }: ComponentReading) => ({
	voltage: rounded(voltage),
	current: rounded(current),
	power: rounded(voltage * current),
	...(resistance === undefined ? {} : { resistance: Number.isFinite(resistance) ? rounded(resistance) : OPEN_READING }),
	...(speed === undefined ? {} : { speedRpm: rounded(speed * RPM_PER_RADIAN_PER_SECOND) }),
})

/** A multi-port part's ports by name ("primary", "output"), each with voltage, current and power. */
function portsReport(solution: DcSolution, componentId: string) {
	const prefix = `${componentId}/`
	return Object.fromEntries(
		Object.entries(solution.ports)
			.filter(([key]) => key.startsWith(prefix))
			.map(([key, reading]) => [key.slice(prefix.length), readingReport(reading)]),
	)
}

type ReadingReport = ReturnType<typeof readingReport>
type ComponentReport = { id: string; type: ComponentType } & (ReadingReport | { ports: Record<string, ReadingReport> })

export function simulationReport(circuit: Circuit, solution: DcSolution) {
	return {
		nodes: nodesOf(circuit, solution),
		components: circuit.components.flatMap((component): ComponentReport[] => {
			const reading = solution.readings[component.id]
			if (reading) return [{ id: component.id, type: component.type, ...readingReport(reading) }]
			const ports = portsReport(solution, component.id)
			return Object.keys(ports).length > 0 ? [{ id: component.id, type: component.type, ports }] : []
		}),
		warnings: solution.warnings,
		conventions: CONVENTIONS,
	}
}

export type ProbeTarget =
	| { kind: "component"; componentId: string }
	| { kind: "ports"; componentId: string }
	| { kind: "pin"; pin: PinRef }

/** A part ("R1", or inside a chip "X1.R1") or a pin ("R1.a", "X1.mid", "X1.R1.a"). */
export function findProbeTarget(given: Circuit, target: string): ProbeTarget | { error: string } {
	// Parts inside chips are found by their path (the engine reads them under it too).
	const circuit = expandSubcircuits(given)
	const component = circuit.components.find((candidate) => candidate.id === target)
	if (component) {
		// A chip has no reading of its own: its pins do (as a multi-pin part's ports).
		return !isChip(component) && pinsOfPart(component, circuit).length === 2
			? { kind: "component", componentId: component.id }
			: { kind: "ports", componentId: component.id }
	}

	const separator = target.lastIndexOf(".")
	const componentId = separator > 0 ? target.slice(0, separator) : target
	const pin = target.slice(separator + 1)
	const owner = circuit.components.find((candidate) => candidate.id === componentId)
	if (!owner) return { error: `No component with id "${componentId}"` }
	const pins = pinsOfPart(owner, circuit)
	if (separator <= 0 || !pins.includes(pin)) {
		return { error: `${owner.type} "${componentId}" has no pin "${pin}" (valid: ${pins.join(", ")})` }
	}
	return { kind: "pin", pin: { componentId, pin } }
}

/** One probe's values without the target name, for time series. */
export function probeValues(solution: DcSolution, target: ProbeTarget) {
	const { target: _name, ...values } = probeReport(solution, target)
	return values
}

export function probeReport(solution: DcSolution, target: ProbeTarget) {
	if (target.kind === "pin") {
		return { target: pinLabel(target.pin), voltage: rounded(solution.pinVoltages[pinKey(target.pin)] ?? 0) }
	}
	if (target.kind === "ports") {
		const ports = portsReport(solution, target.componentId)
		return Object.keys(ports).length > 0
			? { target: target.componentId, ports }
			: { target: target.componentId, note: "No single reading; probe its pins (e.g. a potentiometer's wiper)." }
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
