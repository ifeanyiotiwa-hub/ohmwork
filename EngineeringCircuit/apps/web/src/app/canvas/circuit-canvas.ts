import { Component, type ElementRef, computed, inject, signal, viewChild } from "@angular/core"
import {
	type ComponentType,
	type PinRef,
	type Point,
	type Component as Part,
	buildNets,
	pinDirection,
	pinKey,
	pinPosition,
	pinsOf,
	rotate,
} from "@engineering-circuit/format"
import { CircuitStore } from "../circuit/circuit-store"
import { glowOf } from "../circuit/glow"
import { pathThrough, snap } from "../circuit/geometry"
import { placeBox, routeAround } from "../circuit/routing"
import { labelPlacement, readingPlacement } from "../circuit/labels"
import { isMeter, meterText, valueText } from "../circuit/part-text"
import { formatSi } from "../circuit/si-units"
import {
	SEVEN_SEGMENT_PATHS,
	SYMBOLS,
	type SymbolShape,
	pushButtonPath,
	relayLeverPath,
	spdtLeverPath,
	switchLeverPath,
} from "../circuit/symbols"
import { UI_CONFIG } from "../circuit/ui-config"
import { flowOf, voltageColour } from "../circuit/visuals"

type View = { x: number; y: number; width: number; height: number }

type Interaction =
	| { kind: "idle" }
	| { kind: "pan"; startScreen: Point; startView: View }
	| { kind: "drag"; componentId: string; group: ReadonlySet<string>; startPoint: Point; moved: boolean }
	| { kind: "box"; start: Point }
	| { kind: "drag-note"; noteId: string; startPoint: Point; startPosition: Point; moved: boolean }

/** Note boxes: text size and padding, in canvas units (a monospace-like estimate of the text width). */
const NOTE_LINE_HEIGHT = 16
const NOTE_CHARACTER_WIDTH = 7
const NOTE_PADDING = 8

const NODE_LABEL_OFFSET = { x: 6, y: -8 }

@Component({
	selector: "app-circuit-canvas",
	templateUrl: "./circuit-canvas.html",
	styleUrl: "./circuit-canvas.scss",
})
export class CircuitCanvas {
	protected readonly store = inject(CircuitStore)
	protected readonly config = inject(UI_CONFIG)
	private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>("svg")

	protected readonly view = signal<View>({ ...this.config.initialView })
	protected readonly viewBox = computed(() => {
		const { x, y, width, height } = this.view()
		return `${x} ${y} ${width} ${height}`
	})

	/** Parts being dragged and how far (snapped to the grid). */
	private readonly dragPreview = signal<{ ids: ReadonlySet<string>; delta: Point } | undefined>(undefined)
	/** The Shift-drag selection box, in circuit coordinates. */
	protected readonly selectionBox = signal<{ x: number; y: number; width: number; height: number } | undefined>(undefined)
	private readonly notePreview = signal<{ noteId: string; position: Point } | undefined>(undefined)

	protected readonly notes = computed(() => {
		const preview = this.notePreview()
		const selection = this.store.selection()
		return this.store.circuit().notes.map((note) => {
			const lines = note.text.split("\n")
			const at = preview?.noteId === note.id ? preview.position : note.position
			return {
				id: note.id,
				transform: `translate(${at.x} ${at.y})`,
				lines,
				width: Math.max(...lines.map((line) => line.length)) * NOTE_CHARACTER_WIDTH + 2 * NOTE_PADDING,
				height: lines.length * NOTE_LINE_HEIGHT + NOTE_PADDING,
				selected: selection?.kind === "note" && selection.id === note.id,
			}
		})
	})
	protected readonly noteLineHeight = NOTE_LINE_HEIGHT
	protected readonly notePadding = NOTE_PADDING
	private readonly pointer = signal<Point>({ x: 0, y: 0 })
	private interaction: Interaction = { kind: "idle" }

	private positionOf(part: Part): Point {
		const preview = this.dragPreview()
		return preview?.ids.has(part.id) ? { x: part.position.x + preview.delta.x, y: part.position.y + preview.delta.y } : part.position
	}

	protected readonly parts = computed(() => {
		const solution = this.store.solution()
		const selection = this.store.selection()
		const wiringFrom = this.store.wiringFrom()
		const agentChanged = this.store.agentChanges().components
		const pressed = this.store.pressed()
		const group = this.store.multiSelection()
		const { logicHigh } = this.store.circuit().simulation
		return this.store.circuit().components.map((part) => {
			const at = this.positionOf(part)
			const symbol = SYMBOLS[part.type]
			const current = solution?.readings[part.id]?.current ?? 0
			return {
				part,
				transform: `translate(${at.x} ${at.y})`,
				rotation: `rotate(${part.rotation})`,
				paths: symbol.paths,
				lever: this.leverOf(part, pressed, solution?.states?.[part.id]),
				segments:
					part.type === "seven-segment"
						? Object.entries(SEVEN_SEGMENT_PATHS).map(([pin, d]) => ({
								pin,
								d,
								lit: (solution?.pinVoltages[`${part.id}:${pin}`] ?? 0) > logicHigh / 2,
							}))
						: [],
				label: labelPlacement(symbol, part.rotation, at),
				readingAt: readingPlacement(symbol, part.rotation, at, isMeter(part)),
				marks: (symbol.marks ?? []).map((mark) => {
					const offset = rotate(mark.at, part.rotation)
					return { text: mark.text, x: at.x + offset.x, y: at.y + offset.y }
				}),
				value: valueText(part),
				reading:
					meterText(part, solution?.readings[part.id]) ?? (current === 0 ? undefined : formatSi(Math.abs(current), "A")),
				meter: isMeter(part),
				body: symbol.body,
				glow: glowOf(part, solution, logicHigh),
				selected: (selection?.kind === "component" && selection.id === part.id) || group.has(part.id),
				agentChanged: agentChanged.has(part.id),
				pins: pinsOf(part.type).map((pin) => {
					const ref = { componentId: part.id, pin }
					return {
						ref,
						key: pinKey(ref),
						at: pinPosition(part, pin, at),
						pending: wiringFrom?.componentId === part.id && wiringFrom.pin === pin,
					}
				}),
			}
		})
	})

	protected readonly wires = computed(() => {
		const circuit = this.store.circuit()
		const partsById = new Map(circuit.components.map((part) => [part.id, part]))
		const solution = this.store.solution()
		const currents = this.store.wireCurrents()
		const voltages = solution?.pinVoltages ?? {}
		const largest = Math.max(0, ...Object.values(voltages).map(Math.abs))
		const selection = this.store.selection()
		const dragged = this.dragPreview()?.ids ?? new Set<string>()
		const agentChanged = this.store.agentChanges().wires
		const bodies = circuit.components.map((part) => placeBox(SYMBOLS[part.type].body, this.positionOf(part), part.rotation))

		return circuit.wires.flatMap((wire) => {
			const from = partsById.get(wire.from.componentId)
			const to = partsById.get(wire.to.componentId)
			if (!from || !to) return []
			const bends = dragged.has(from.id) || dragged.has(to.id) ? [] : wire.bends
			const start = pinPosition(from, wire.from.pin, this.positionOf(from))
			const end = pinPosition(to, wire.to.pin, this.positionOf(to))
			const points =
				bends.length > 0
					? [start, ...bends, end]
					: routeAround(
							{ at: start, direction: pinDirection(from, wire.from.pin) },
							{ at: end, direction: pinDirection(to, wire.to.pin) },
							bodies,
							this.config.gridSize,
						)
			const voltage = voltages[pinKey(wire.from)]
			return [
				{
					id: wire.id,
					path: pathThrough(points),
					colour: voltage === undefined ? null : voltageColour(voltage, largest),
					flow: solution ? flowOf(currents[wire.id] ?? 0, this.config.flow) : undefined,
					selected: selection?.kind === "wire" && selection.id === wire.id,
					agentChanged: agentChanged.has(wire.id),
				},
			]
		})
	})

	protected readonly nodeLabels = computed(() => {
		const solution = this.store.solution()
		if (!solution) return []
		const circuit = this.store.circuit()
		const partsById = new Map(circuit.components.map((part) => [part.id, part]))
		return buildNets(circuit).flatMap((net) => {
			const [first] = net.pins
			const part = first ? partsById.get(first.componentId) : undefined
			if (!first || !part || net.pins.length < 2) return []
			const at = pinPosition(part, first.pin, this.positionOf(part))
			const voltage = solution.pinVoltages[pinKey(first)] ?? 0
			return [{ key: pinKey(first), x: at.x + NODE_LABEL_OFFSET.x, y: at.y + NODE_LABEL_OFFSET.y, text: formatSi(voltage, "V") }]
		})
	})

	protected readonly rubberBand = computed(() => {
		const from = this.store.wiringFrom()
		const part = from && this.store.circuit().components.find((candidate) => candidate.id === from.componentId)
		if (!from || !part) return undefined
		const start = pinPosition(part, from.pin)
		const end = this.pointer()
		return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
	})


	protected onBackgroundDown(event: PointerEvent): void {
		const placing = this.store.placing()
		if (placing) {
			this.place(placing, this.toCircuitPoint(event))
			return
		}
		this.store.wiringFrom.set(undefined)
		if (event.shiftKey) {
			this.interaction = { kind: "box", start: this.toCircuitPoint(event) }
			this.capture(event)
			return
		}
		this.store.clearSelection()
		this.interaction = { kind: "pan", startScreen: { x: event.clientX, y: event.clientY }, startView: this.view() }
		this.capture(event)
	}

	protected onPartDown(event: PointerEvent, part: Part): void {
		event.stopPropagation()
		const placing = this.store.placing()
		if (placing) {
			this.place(placing, this.toCircuitPoint(event))
			return
		}
		if (event.shiftKey) {
			this.store.toggleInSelection(part.id)
			return
		}
		const inGroup = this.store.multiSelection().has(part.id)
		if (!inGroup) {
			this.store.multiSelection.set(new Set())
			this.store.selection.set({ kind: "component", id: part.id })
		}
		if (part.type === "push-button") this.store.press(part.id)
		this.interaction = {
			kind: "drag",
			componentId: part.id,
			group: inGroup ? this.store.multiSelection() : new Set([part.id]),
			startPoint: this.toCircuitPoint(event),
			moved: false,
		}
		this.capture(event)
	}

	protected onNoteDown(event: PointerEvent, noteId: string): void {
		event.stopPropagation()
		const note = this.store.circuit().notes.find((candidate) => candidate.id === noteId)
		if (!note) return
		this.store.selection.set({ kind: "note", id: noteId })
		this.interaction = { kind: "drag-note", noteId, startPoint: this.toCircuitPoint(event), startPosition: note.position, moved: false }
		this.capture(event)
	}

	protected onPinDown(event: PointerEvent, ref: PinRef): void {
		event.stopPropagation()
		const from = this.store.wiringFrom()
		if (!from) {
			this.store.wiringFrom.set(ref)
			this.pointer.set(this.toCircuitPoint(event))
			return
		}
		this.store.wiringFrom.set(undefined)
		if (from.componentId === ref.componentId && from.pin === ref.pin) return
		this.store.apply({ type: "connect", from, to: ref })
	}

	protected onWireDown(event: PointerEvent, wireId: string): void {
		event.stopPropagation()
		const from = this.store.wiringFrom()
		this.store.wiringFrom.set(undefined)
		if (from) {
			// Finishing a wire on a wire: put a junction there and join it, as one undoable change.
			const grid = this.config.gridSize
			const point = this.toCircuitPoint(event)
			this.store.joinWire(from, wireId, { x: snap(point.x, grid), y: snap(point.y, grid) })
			return
		}
		this.store.selection.set({ kind: "wire", id: wireId })
	}

	protected onPointerMove(event: PointerEvent): void {
		const point = this.toCircuitPoint(event)
		this.pointer.set(point)
		const interaction = this.interaction

		if (interaction.kind === "pan") {
			const scale = interaction.startView.width / this.svg().nativeElement.clientWidth
			this.view.set({
				...interaction.startView,
				x: interaction.startView.x - (event.clientX - interaction.startScreen.x) * scale,
				y: interaction.startView.y - (event.clientY - interaction.startScreen.y) * scale,
			})
			return
		}

		if (interaction.kind === "drag-note") {
			const dx = point.x - interaction.startPoint.x
			const dy = point.y - interaction.startPoint.y
			if (!interaction.moved && Math.hypot(dx, dy) < this.config.dragThreshold) return
			interaction.moved = true
			const grid = this.config.gridSize
			this.notePreview.set({
				noteId: interaction.noteId,
				position: { x: snap(interaction.startPosition.x + dx, grid), y: snap(interaction.startPosition.y + dy, grid) },
			})
			return
		}

		if (interaction.kind === "box") {
			const { start } = interaction
			this.selectionBox.set({
				x: Math.min(start.x, point.x),
				y: Math.min(start.y, point.y),
				width: Math.abs(point.x - start.x),
				height: Math.abs(point.y - start.y),
			})
			return
		}

		if (interaction.kind === "drag") {
			const dx = point.x - interaction.startPoint.x
			const dy = point.y - interaction.startPoint.y
			if (!interaction.moved && Math.hypot(dx, dy) < this.config.dragThreshold) return
			interaction.moved = true
			this.store.releaseButtons()
			const grid = this.config.gridSize
			this.dragPreview.set({ ids: interaction.group, delta: { x: snap(dx, grid), y: snap(dy, grid) } })
		}
	}

	protected onPointerUp(): void {
		this.store.releaseButtons()
		const interaction = this.interaction
		this.interaction = { kind: "idle" }
		if (interaction.kind === "drag-note") {
			const preview = this.notePreview()
			this.notePreview.set(undefined)
			if (interaction.moved && preview) this.store.apply({ type: "move-note", noteId: preview.noteId, position: preview.position })
			return
		}
		if (interaction.kind === "box") {
			const box = this.selectionBox()
			this.selectionBox.set(undefined)
			if (!box) return
			const inside = this.store
				.circuit()
				.components.filter(({ position: { x, y } }) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height)
				.map((component) => component.id)
			this.store.multiSelection.set(new Set(inside))
			this.store.selection.set(undefined)
			return
		}
		if (interaction.kind !== "drag") return

		const preview = this.dragPreview()
		this.dragPreview.set(undefined)
		if (interaction.moved && preview) {
			this.store.moveParts(preview.ids, preview.delta)
			return
		}

		const part = this.store.circuit().components.find((candidate) => candidate.id === interaction.componentId)
		if (part?.type === "switch") {
			this.store.apply({ type: "set-parameter", componentId: part.id, name: "closed", value: !part.params.closed })
		}
		if (part?.type === "logic-input") {
			this.store.apply({ type: "set-parameter", componentId: part.id, name: "high", value: !part.params.high })
		}
		if (part?.type === "switch-spdt") {
			const position = part.params.position === "a" ? "b" : "a"
			this.store.apply({ type: "set-parameter", componentId: part.id, name: "position", value: position })
		}
	}

	protected onWheel(event: WheelEvent): void {
		event.preventDefault()
		const point = this.toCircuitPoint(event)
		const view = this.view()
		const factor = event.deltaY > 0 ? this.config.zoomFactor : 1 / this.config.zoomFactor
		const width = Math.min(this.config.maxZoomWidth, Math.max(this.config.minZoomWidth, view.width * factor))
		const scale = width / view.width
		this.view.set({
			x: point.x - (point.x - view.x) * scale,
			y: point.y - (point.y - view.y) * scale,
			width,
			height: view.height * scale,
		})
	}

	private leverOf(part: Part, pressed: ReadonlySet<string>, state: readonly boolean[] | undefined): string | undefined {
		if (part.type === "relay") return relayLeverPath(state?.[0] ?? false)
		if (part.type === "switch") return switchLeverPath(part.params.closed)
		if (part.type === "push-button") return pushButtonPath(part.params.normallyOpen === pressed.has(part.id))
		if (part.type === "switch-spdt") return spdtLeverPath(part.params.position)
		return undefined
	}

	private place(type: ComponentType, point: Point): void {
		const grid = this.config.gridSize
		const placed = this.store.apply({
			type: "add-component",
			component: { type, position: { x: snap(point.x, grid), y: snap(point.y, grid) } },
		})
		this.store.placing.set(undefined)
		const added = placed?.components.at(-1)
		if (added) this.store.selection.set({ kind: "component", id: added.id })
	}

	private toCircuitPoint(event: MouseEvent): Point {
		const svg = this.svg().nativeElement
		const matrix = svg.getScreenCTM()
		if (!matrix) return { x: 0, y: 0 }
		const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
		return { x: point.x, y: point.y }
	}

	private capture(event: PointerEvent): void {
		this.svg().nativeElement.setPointerCapture(event.pointerId)
	}
}
