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
import type { DcSolution } from "@engineering-circuit/engine"
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
import { type View, pinchView } from "./gestures"

/** Keys that move a focused part one grid step. */
const ARROW_STEPS: Readonly<Record<string, Point>> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
}
/** Keys that act on a focused part, wire or note as a click would. */
const ACTIVATE_KEYS: ReadonlySet<string> = new Set(["Enter", " "])

type Interaction =
	| { kind: "idle" }
	| { kind: "pan"; startScreen: Point; startView: View }
	| { kind: "drag"; componentId: string; group: ReadonlySet<string>; startPoint: Point; moved: boolean }
	| { kind: "box"; start: Point }
	| { kind: "drag-note"; noteId: string; startPoint: Point; startPosition: Point; moved: boolean }
	| { kind: "pinch"; from: readonly [Point, Point]; startView: View }

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
	/** Half a grid step: the largest tap target that never overlaps the next pin. */
	protected readonly pinHitRadius = this.config.gridSize / 2
	protected readonly noteLineHeight = NOTE_LINE_HEIGHT
	protected readonly notePadding = NOTE_PADDING
	private readonly pointer = signal<Point>({ x: 0, y: 0 })
	private interaction: Interaction = { kind: "idle" }
	/** Fingers on the canvas, in screen pixels from its top left. */
	private readonly touches = new Map<number, Point>()
	private longPress: { timer: ReturnType<typeof setTimeout>; start: Point } | undefined

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
				segments: this.segmentsOf(part, solution, logicHigh),
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
					label: `Wire ${wire.id} from ${wire.from.componentId} ${wire.from.pin} to ${wire.to.componentId} ${wire.to.pin}`,
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
		if (this.startsPinch(event)) return
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
		const start = this.toCircuitPoint(event)
		this.holdFor(event, () => {
			this.interaction = { kind: "box", start }
		})
	}

	protected onPartDown(event: PointerEvent, part: Part): void {
		event.stopPropagation()
		if (this.startsPinch(event)) return
		const placing = this.store.placing()
		if (placing) {
			this.place(placing, this.toCircuitPoint(event))
			return
		}
		if (event.shiftKey) {
			this.store.toggleInSelection(part.id)
			return
		}
		const before = { group: this.store.multiSelection(), single: this.store.selection() }
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
		// Holding a push button is how it is used, so a long press there keeps it pressed rather than selecting it.
		if (part.type === "push-button") return
		this.holdFor(event, () => {
			this.interaction = { kind: "idle" }
			this.dragPreview.set(undefined)
			this.store.multiSelection.set(before.group)
			this.store.selection.set(before.single)
			this.store.toggleInSelection(part.id)
		})
	}

	protected onNoteDown(event: PointerEvent, noteId: string): void {
		event.stopPropagation()
		if (this.startsPinch(event)) return
		const note = this.store.circuit().notes.find((candidate) => candidate.id === noteId)
		if (!note) return
		this.store.selection.set({ kind: "note", id: noteId })
		this.interaction = { kind: "drag-note", noteId, startPoint: this.toCircuitPoint(event), startPosition: note.position, moved: false }
		this.capture(event)
	}

	protected onPinDown(event: PointerEvent, ref: PinRef): void {
		event.stopPropagation()
		if (this.startsPinch(event)) return
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
		if (this.startsPinch(event)) return
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
		if (this.touches.has(event.pointerId)) this.touches.set(event.pointerId, this.screenPoint(event))
		const held = this.longPress
		if (held) {
			const now = this.screenPoint(event)
			if (Math.hypot(now.x - held.start.x, now.y - held.start.y) > this.config.longPressSlopPx) this.cancelLongPress()
		}
		const interaction = this.interaction
		if (interaction.kind === "pinch") {
			const [first, second] = [...this.touches.values()]
			if (!first || !second) return
			const limits = { minWidth: this.config.minZoomWidth, maxWidth: this.config.maxZoomWidth }
			this.view.set(pinchView(interaction.startView, interaction.from, [first, second], this.svg().nativeElement.clientWidth, limits))
			return
		}

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

	protected onPointerUp(event: PointerEvent): void {
		this.store.releaseButtons()
		this.touches.delete(event.pointerId)
		this.cancelLongPress()
		if (this.interaction.kind === "pinch") {
			this.interaction = { kind: "idle" }
			return
		}
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
		if (part) this.flip(part)
	}

	/**
	 * A focused part from the keyboard: Enter or Space does what a click does (selects it, flips a switch; holds a
	 * push button down while held), and the arrow keys move it, or its group, one grid step.
	 */
	protected onPartKey(event: KeyboardEvent, part: Part): void {
		const step = ARROW_STEPS[event.key]
		if (step) {
			event.preventDefault()
			this.selectFromKeyboard(part)
			const grid = this.config.gridSize
			this.store.moveParts(this.store.selectedParts(), { x: step.x * grid, y: step.y * grid })
			return
		}
		if (!ACTIVATE_KEYS.has(event.key)) return
		event.preventDefault()
		if (event.repeat) return
		this.selectFromKeyboard(part)
		if (part.type === "push-button") this.store.press(part.id)
		else this.flip(part)
	}

	protected onPartKeyUp(event: KeyboardEvent, part: Part): void {
		if (ACTIVATE_KEYS.has(event.key) && part.type === "push-button") this.store.releaseButtons()
	}

	protected onWireKey(event: KeyboardEvent, wireId: string): void {
		if (!ACTIVATE_KEYS.has(event.key)) return
		event.preventDefault()
		this.store.clearSelection()
		this.store.selection.set({ kind: "wire", id: wireId })
	}

	protected onNoteKey(event: KeyboardEvent, noteId: string): void {
		if (!ACTIVATE_KEYS.has(event.key)) return
		event.preventDefault()
		this.store.clearSelection()
		this.store.selection.set({ kind: "note", id: noteId })
	}

	private selectFromKeyboard(part: Part): void {
		if (this.store.multiSelection().has(part.id)) return
		this.store.multiSelection.set(new Set())
		this.store.selection.set({ kind: "component", id: part.id })
	}

	/** What a click on a part does besides selecting it: flips a switch, a two-way switch or a logic input. */
	private flip(part: Part): void {
		if (part.type === "switch") {
			this.store.apply({ type: "set-parameter", componentId: part.id, name: "closed", value: !part.params.closed })
		}
		if (part.type === "logic-input") {
			this.store.apply({ type: "set-parameter", componentId: part.id, name: "high", value: !part.params.high })
		}
		if (part.type === "switch-spdt") {
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

	/** A display's segments: the logic display lights on a logic-high pin, the LED one on current through the segment. */
	private segmentsOf(part: Part, solution: DcSolution | undefined, logicHigh: number): { pin: string; d: string; lit: boolean }[] {
		if (part.type !== "seven-segment" && part.type !== "seven-segment-led") return []
		const lit = (pin: string): boolean =>
			part.type === "seven-segment"
				? (solution?.pinVoltages[`${part.id}:${pin}`] ?? 0) > logicHigh / 2
				: Math.abs(solution?.ports[`${part.id}/${pin}`]?.current ?? 0) > part.params.maxBrightnessCurrent * this.config.segmentLitFraction
		return Object.entries(SEVEN_SEGMENT_PATHS).map(([pin, d]) => ({ pin, d, lit: lit(pin) }))
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

	/** Tracks a finger; true when it is the second one, which turns whatever the first one started into a pinch. */
	private startsPinch(event: PointerEvent): boolean {
		if (event.pointerType !== "touch") return false
		this.touches.set(event.pointerId, this.screenPoint(event))
		const [first, second] = [...this.touches.values()]
		if (this.touches.size !== 2 || !first || !second) return false
		this.cancelLongPress()
		this.dragPreview.set(undefined)
		this.selectionBox.set(undefined)
		this.notePreview.set(undefined)
		this.interaction = { kind: "pinch", from: [first, second], startView: this.view() }
		this.capture(event)
		return true
	}

	/** A finger held still acts as Shift: `action` runs unless the finger moves or lifts first. Touch only. */
	private holdFor(event: PointerEvent, action: () => void): void {
		if (event.pointerType !== "touch") return
		this.cancelLongPress()
		const timer = setTimeout(() => {
			this.longPress = undefined
			action()
		}, this.config.longPressMs)
		this.longPress = { timer, start: this.screenPoint(event) }
	}

	private cancelLongPress(): void {
		if (this.longPress) clearTimeout(this.longPress.timer)
		this.longPress = undefined
	}

	private screenPoint(event: PointerEvent): Point {
		const box = this.svg().nativeElement.getBoundingClientRect()
		return { x: event.clientX - box.left, y: event.clientY - box.top }
	}
}
