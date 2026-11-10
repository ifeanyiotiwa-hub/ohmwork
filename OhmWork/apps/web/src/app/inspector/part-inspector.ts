import { Component, computed, inject, signal } from "@angular/core"
import { type ComponentType, chipDefinition, isChip, paramFieldsOf, pinsOfPart } from "@ohmwork/format"
import { CircuitStore } from "../circuit/circuit-store"
import { speedText } from "../circuit/part-text"
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
	| { name: string; kind: "text"; value: string; maxLength: number }

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
		// A chip's only parameter is which chip it places; its pins are shown instead.
		if (!part || isChip(part)) return []
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
				case "text":
					return { name: field.name, kind: "text", value: typeof value === "string" ? value : "", maxLength: field.maxLength }
			}
		})
	})

	/** A part whose voltage (first pin to second) can go on the oscilloscope without a probe; probes are already on it. */
	protected readonly watchable = computed(() => {
		const part = this.store.selectedComponent()
		// A chip has no voltage of its own across two pins to plot (its pins can be probed).
		return part && part.type !== "scope-probe" && !isChip(part) && pinsOfPart(part, this.store.circuit()).length >= 2 ? part.id : undefined
	})

	/** The selected chip: which chip it places, and its pins (renamed here, for every copy). */
	protected readonly chip = computed(() => {
		const part = this.store.selectedComponent()
		if (!part || !isChip(part)) return undefined
		const definition = chipDefinition(this.store.circuit(), part)
		return definition && { id: part.id, definition: definition.id, name: definition.name, pins: definition.pins.map((pin) => pin.name) }
	})

	/** The name a new chip gets (Make chip, with a group selected). */
	protected readonly chipName = signal("Chip")

	protected onChipName(event: Event): void {
		this.chipName.set((event.target as HTMLInputElement).value)
	}

	protected renamePin(definition: string, pin: string, event: Event): void {
		const input = event.target as HTMLInputElement
		const name = input.value.trim()
		if (name === "" || name === pin) {
			input.value = pin
			return
		}
		this.store.renameChipPin(definition, pin, name)
		// A refused name (taken, or not a name) is explained; the field shows the pin's name again.
		if (this.store.editError()) input.value = pin
	}

	protected readonly reading = computed(() => {
		const part = this.store.selectedComponent()
		const reading = part && this.store.solution()?.readings[part.id]
		if (!reading) return undefined
		return {
			voltage: formatSi(reading.voltage, "V"),
			current: formatSi(reading.current, "A"),
			power: formatSi(reading.voltage * reading.current, "W"),
			speed: speedText(reading),
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

	/** Text (a net label's name): an empty or unchanged entry is put back, as the format requires a name. */
	protected setText(componentId: string, name: string, current: string, event: Event): void {
		const input = event.target as HTMLInputElement
		const text = input.value.trim()
		if (text === "" || text === current) {
			input.value = current
			return
		}
		this.store.apply({ type: "set-parameter", componentId, name, value: text })
	}

	protected setChoice(componentId: string, name: string, event: Event): void {
		this.store.apply({ type: "set-parameter", componentId, name, value: (event.target as HTMLSelectElement).value })
	}
}
