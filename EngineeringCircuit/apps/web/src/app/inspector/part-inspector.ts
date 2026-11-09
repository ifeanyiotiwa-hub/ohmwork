import { Component, computed, inject } from "@angular/core"
import { type ComponentType, paramFieldsOf } from "@engineering-circuit/format"
import { CircuitStore } from "../circuit/circuit-store"
import { formatSi, parseSi, unitSymbolOf } from "../circuit/si-units"
import { PART_NAMES } from "../circuit/symbols"
import { LessonCard } from "../lessons/lesson-card"

type FieldView =
	| {
			name: string
			kind: "number"
			text: string
			unit: string
			hint: string | undefined
			slider: { min: number; max: number; value: number } | undefined
	  }
	| { name: string; kind: "boolean"; checked: boolean }
	| { name: string; kind: "choice"; value: string; options: string[] }

const RECENT_HISTORY = 5

/** The other form of a stored quantity, shown under its field (agents may also set it by that name). */
function equivalentHint(type: ComponentType, name: string, value: number): string | undefined {
	if (name === "frequency") return `period ${formatSi(1 / value, "s")}`
	if (name === "amplitude" && type === "ac-source") return `RMS ${formatSi(value / Math.SQRT2, "V")}`
	return undefined
}

@Component({
	selector: "app-part-inspector",
	imports: [LessonCard],
	templateUrl: "./part-inspector.html",
	styleUrl: "./part-inspector.scss",
})
export class PartInspector {
	protected readonly store = inject(CircuitStore)
	protected readonly partNames = PART_NAMES

	protected readonly fields = computed<FieldView[]>(() => {
		const part = this.store.selectedComponent()
		if (!part) return []
		const params: Record<string, unknown> = part.params
		return paramFieldsOf(part.type).map((field): FieldView => {
			const value = params[field.name]
			switch (field.kind) {
				case "number": {
					const unit = unitSymbolOf(field.description)
					const number = typeof value === "number" ? value : undefined
					return {
						name: field.name,
						kind: "number",
						unit,
						text: number === undefined ? "" : formatSi(number, unit),
						hint: number === undefined ? undefined : equivalentHint(part.type, field.name, number),
						slider: field.range && number !== undefined ? { ...field.range, value: number } : undefined,
					}
				}
				case "boolean":
					return { name: field.name, kind: "boolean", checked: value === true }
				case "choice":
					return { name: field.name, kind: "choice", value: String(value), options: field.options }
			}
		})
	})

	protected readonly reading = computed(() => {
		const part = this.store.selectedComponent()
		const reading = part && this.store.solution()?.readings[part.id]
		if (!reading) return undefined
		return {
			voltage: formatSi(reading.voltage, "V"),
			current: formatSi(reading.current, "A"),
			power: formatSi(reading.voltage * reading.current, "W"),
		}
	})

	/** Multi-port parts (transformer, controlled sources): each port's voltage and current. */
	protected readonly ports = computed(() => {
		const part = this.store.selectedComponent()
		const ports = this.store.solution()?.ports ?? {}
		if (!part) return []
		const prefix = `${part.id}/`
		return Object.entries(ports)
			.filter(([key]) => key.startsWith(prefix))
			.map(([key, reading]) => ({
				name: key.slice(prefix.length),
				voltage: formatSi(reading.voltage, "V"),
				current: formatSi(reading.current, "A"),
			}))
	})

	protected readonly wireCurrent = computed(() => {
		const wire = this.store.selectedWire()
		return wire ? formatSi(Math.abs(this.store.wireCurrents()[wire.id] ?? 0), "A") : undefined
	})

	protected readonly recentHistory = computed(() => this.store.history().slice(-RECENT_HISTORY).reverse())

	protected setNumber(componentId: string, name: string, event: Event): void {
		const text = (event.target as HTMLInputElement).value
		const value = parseSi(text)
		if (value === undefined) {
			this.store.editError.set(`Couldn't read "${text}" as a number. Try 1k, 4.7u or 10.`)
			return
		}
		this.store.apply({ type: "set-parameter", componentId, name, value })
	}

	protected readonly settings = computed(() => {
		const { timeStep, speed, temperature } = this.store.circuit().simulation
		return { timeStep: formatSi(timeStep, "s"), speed: String(speed), temperature: `${temperature} °C` }
	})

	protected setSimulation(name: "timeStep" | "speed" | "temperature", event: Event): void {
		const text = (event.target as HTMLInputElement).value
		const value = parseSi(name === "temperature" ? text.replace(/\s*°?C\s*$/i, "") : text)
		if (value === undefined) {
			this.store.editError.set(`Couldn't read "${text}" as a number. Try 5u, 0.01 or 1e-6.`)
			return
		}
		this.store.apply({ type: "set-simulation", [name]: value })
	}

	protected setStepping(event: Event): void {
		const value = (event.target as HTMLSelectElement).value
		if (value === "fixed" || value === "adaptive") this.store.apply({ type: "set-simulation", stepping: value })
	}

	protected setNoteText(noteId: string, event: Event): void {
		const text = (event.target as HTMLTextAreaElement).value
		this.store.apply({ type: "edit-note", noteId, text })
	}

	protected slide(componentId: string, name: string, event: Event): void {
		this.store.apply({ type: "set-parameter", componentId, name, value: Number((event.target as HTMLInputElement).value) })
	}

	protected setBoolean(componentId: string, name: string, event: Event): void {
		this.store.apply({ type: "set-parameter", componentId, name, value: (event.target as HTMLInputElement).checked })
	}

	protected setChoice(componentId: string, name: string, event: Event): void {
		this.store.apply({ type: "set-parameter", componentId, name, value: (event.target as HTMLSelectElement).value })
	}
}
