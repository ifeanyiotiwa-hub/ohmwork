import type { ComponentReading } from "@engineering-circuit/engine"
import { type Component, type ComponentType, paramFieldsOf } from "@engineering-circuit/format"
import { formatSi, unitSymbolOf } from "./si-units"

/** How a true / false parameter reads on the canvas. */
const BOOLEAN_TEXT: Record<string, [whenTrue: string, whenFalse: string]> = {
	closed: ["closed", "open"],
	normallyOpen: ["NO", "NC"],
}
const NO_READING = "–"
/** What a multimeter shows when nothing connects its leads ("overload"). */
const OPEN_CIRCUIT = "OL (open)"

export function valueText(component: Component): string {
	switch (component.type) {
		case "ac-source": {
			const { amplitude, frequency, offset } = component.params
			const shifted = offset === 0 ? "" : ` ${offset > 0 ? "+" : ""}${formatSi(offset, "V")}`
			return `${formatSi(amplitude, "V")} ${formatSi(frequency, "Hz")}${shifted}`
		}
		case "square-source": {
			const { low, high, frequency } = component.params
			return `${formatSi(low, "V")}–${formatSi(high, "V")} ${formatSi(frequency, "Hz")}`
		}
		default:
			return paramText(component)
	}
}

function paramText(component: Component): string {
	const params: Record<string, unknown> = component.params
	return paramFieldsOf(component.type)
		.map((field) => {
			const value = params[field.name]
			if (field.kind === "number" && typeof value === "number") return formatSi(value, unitSymbolOf(field.description))
			if (field.kind === "boolean") {
				const [whenTrue, whenFalse] = BOOLEAN_TEXT[field.name] ?? ["yes", "no"]
				return value === true ? whenTrue : whenFalse
			}
			return String(value)
		})
		.join(" ")
}

const METER_TYPES: ReadonlySet<ComponentType> = new Set(["voltmeter", "ammeter", "ohmmeter"])

export const isMeter = (component: Component): boolean => METER_TYPES.has(component.type)

/** A meter's display; undefined for parts that aren't meters. */
export function meterText(component: Component, reading: ComponentReading | undefined): string | undefined {
	switch (component.type) {
		case "voltmeter":
			return reading ? formatSi(reading.voltage, "V") : NO_READING
		case "ammeter":
			return reading ? formatSi(reading.current, "A") : NO_READING
		case "ohmmeter": {
			const resistance = reading?.resistance
			if (resistance === undefined) return NO_READING
			return Number.isFinite(resistance) ? formatSi(resistance, "Ω") : OPEN_CIRCUIT
		}
		default:
			return undefined
	}
}
