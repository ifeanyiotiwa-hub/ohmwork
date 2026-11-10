import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { type ClientMessage, type LiveState, applyCommand } from "@engineering-circuit/editing"
import { createCircuit } from "@engineering-circuit/format"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { LiveLink, type LiveListener, type LiveStatus } from "../live/live-link"
import { CircuitStore } from "./circuit-store"
import { DEFAULT_UI_CONFIG } from "./ui-config"

let store: CircuitStore

beforeEach(() => {
	store = TestBed.inject(CircuitStore)
})

test("starts with the KVL example solved: 2 Ω gets 4 V at 2 A", () => {
	expect(store.solution()?.readings["R2"]).toEqual({ voltage: expect.closeTo(4, 9), current: expect.closeTo(2, 9) })
	expect(store.errors()).toEqual([])
})

test("an edit re-solves the circuit", () => {
	store.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: 2 })
	expect(store.solution()?.readings["R2"]?.voltage).toBeCloseTo(3, 9)
})

test("a rejected edit explains why and changes nothing", () => {
	expect(store.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: -1 })).toBeUndefined()
	expect(store.editError()).toBeTruthy()
	expect(store.solution()?.readings["R2"]?.voltage).toBeCloseTo(4, 9)
})

test("undo reverses the last change", () => {
	store.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: 2 })
	store.undo()
	expect(store.solution()?.readings["R2"]?.voltage).toBeCloseTo(4, 9)
})

test("removing the selected part removes its wires and clears the selection", () => {
	store.selection.set({ kind: "component", id: "R1" })
	store.removeSelected()
	expect(store.circuit().components.map((component) => component.id)).toEqual(["V1", "R2", "GND1"])
	expect(store.circuit().wires.map((wire) => wire.id)).toEqual(["w3", "w4"])
	expect(store.selection()).toBeUndefined()
})

test("a note can be added, selected and removed", () => {
	store.addNote("Try 4 Ω here")
	expect(store.selectedNote()?.text).toBe("Try 4 Ω here")
	store.removeSelected()
	expect(store.circuit().notes).toEqual([])
	expect(store.selection()).toBeUndefined()
})

test("turning the value dial steps a part's value; one turn of several steps is undone at once", () => {
	const resistance = () => store.circuit().components.find((component) => component.id === "R2")?.params
	expect(resistance()).toMatchObject({ resistance: 2 })
	store.turnDial("R2", 1, "turn-1")
	store.turnDial("R2", 1, "turn-1")
	store.turnDial("R2", 1, "turn-1")
	expect(resistance()).toMatchObject({ resistance: 3.3 })
	store.undo()
	expect(resistance()).toMatchObject({ resistance: 2 })
})

test("a part without a dial is left as it is", () => {
	const before = store.circuit()
	store.turnDial("GND1", 1, "turn-2")
	expect(store.circuit()).toBe(before)
})

test("Paste is only offered once something has been copied", () => {
	expect(store.canPaste()).toBe(false)
	store.toggleInSelection("R1")
	store.copySelection()
	expect(store.canPaste()).toBe(true)
})

test("a group of parts is copied, pasted with new names and deleted, each as one undo step", () => {
	store.toggleInSelection("R1")
	store.toggleInSelection("R2")
	store.copySelection()
	store.paste()
	expect(store.circuit().components.map((component) => component.id)).toEqual(["V1", "R1", "R2", "GND1", "R3", "R4"])
	expect([...store.multiSelection()]).toEqual(["R3", "R4"])
	store.removeSelected()
	expect(store.circuit().components.map((component) => component.id)).toEqual(["V1", "R1", "R2", "GND1"])
	store.undo()
	expect(store.circuit().components).toHaveLength(6)
	store.undo()
	expect(store.circuit().components).toHaveLength(4)
})

test("a group moves together, as one change", () => {
	store.selectAll()
	store.moveParts(store.selectedParts(), { x: 20, y: 40 })
	expect(store.circuit().components[0]?.position).toEqual({ x: 20, y: 140 })
	expect(store.history().at(-1)?.summary).toBe("Moved 4 parts")
})

test("wire currents follow the loop", () => {
	expect(store.wireCurrents()["w1"]).toBeCloseTo(2, 9)
})

test("holding a push button re-solves the circuit until it is released", () => {
	store.replace(
		{
			...createCircuit("Button"),
			components: [
				{ id: "V1", type: "voltage-source", position: { x: 0, y: 0 }, rotation: 0, params: { voltage: 5 } },
				{ id: "PB1", type: "push-button", position: { x: 100, y: 0 }, rotation: 0, params: { normallyOpen: true } },
				{ id: "R1", type: "resistor", position: { x: 200, y: 0 }, rotation: 0, params: { resistance: 1000, powerRating: 0.25 } },
				{ id: "GND1", type: "ground", position: { x: 0, y: 100 }, rotation: 0, params: {} },
			],
			wires: [
				{ id: "w1", from: { componentId: "V1", pin: "positive" }, to: { componentId: "PB1", pin: "a" }, bends: [] },
				{ id: "w2", from: { componentId: "PB1", pin: "b" }, to: { componentId: "R1", pin: "a" }, bends: [] },
				{ id: "w3", from: { componentId: "R1", pin: "b" }, to: { componentId: "GND1", pin: "terminal" }, bends: [] },
				{ id: "w4", from: { componentId: "V1", pin: "negative" }, to: { componentId: "GND1", pin: "terminal" }, bends: [] },
			],
		},
		"Button test",
	)
	expect(store.solution()?.readings["R1"]?.current).toBeCloseTo(0, 12)
	store.press("PB1")
	expect(store.solution()?.readings["R1"]?.current).toBeCloseTo(0.005, 12)
	store.releaseButtons()
	expect(store.solution()?.readings["R1"]?.current).toBeCloseTo(0, 12)
	expect(store.history().at(-1)?.summary).toBe("Button test")
})

test("a short circuit becomes a plain-language error", () => {
	store.apply({ type: "connect", from: { componentId: "V1", pin: "positive" }, to: { componentId: "V1", pin: "negative" } })
	expect(store.errors()[0]?.message).toContain("Short circuit")
})

describe("joined to the live link", () => {
	class FakeLiveLink {
		readonly status = signal<LiveStatus>("off")
		readonly sent: ClientMessage[] = []
		listener: LiveListener | undefined

		connect(_url: string, listener: LiveListener): void {
			this.listener = listener
		}

		send(message: ClientMessage): void {
			this.sent.push(message)
		}

		reconnects = 0
		reconnectNow(): void {
			this.reconnects += 1
		}
	}

	let live: FakeLiveLink
	const sharedCircuit = createCircuit("Shared")

	function serverSends(state: LiveState): void {
		live.listener?.state(state)
	}

	beforeEach(() => {
		TestBed.resetTestingModule()
		TestBed.configureTestingModule({ providers: [{ provide: LiveLink, useClass: FakeLiveLink }] })
		store = TestBed.inject(CircuitStore)
		live = TestBed.inject(LiveLink) as unknown as FakeLiveLink
		store.joinLive("ws://127.0.0.1:5000/?token=t")
		serverSends({ revision: 0, circuit: sharedCircuit, history: [] })
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	test("shows the shared circuit instead of its own", () => {
		expect(store.circuit().name).toBe("Shared")
	})

	test("edits go to the server and show at once while it answers", () => {
		const placed = store.apply({ type: "add-component", component: { type: "resistor" } })

		expect(live.sent).toEqual([{ type: "edit", command: { type: "add-component", component: { type: "resistor" } } }])
		expect(placed?.components.map((component) => component.id)).toEqual(["R1"])
		expect(store.circuit().components.map((component) => component.id)).toEqual(["R1"])
	})

	test("an edit the server refuses is dropped and explained", () => {
		store.apply({ type: "add-component", component: { type: "resistor" } })
		live.listener?.rejected("Someone removed it first")

		expect(store.circuit().components).toEqual([])
		expect(store.editError()).toBe("Someone removed it first")
	})

	test("an invalid edit is refused locally and never sent", () => {
		expect(store.apply({ type: "remove-component", componentId: "X1" })).toBeUndefined()
		expect(live.sent).toEqual([])
	})

	test("undo and New are sent to the shared history", () => {
		store.undo()
		store.newCircuit()
		expect(live.sent.map((message) => message.type)).toEqual(["undo", "replace"])
	})

	test("what the agent changed is highlighted briefly", () => {
		vi.useFakeTimers()
		const withResistor = applyCommand(sharedCircuit, { type: "add-component", component: { type: "resistor" } })
		if (!withResistor.ok) throw new Error("setup failed")
		const change = { revision: 1, author: "agent" as const, summary: 'Added resistor "R1"' }
		serverSends({ revision: 1, circuit: withResistor.circuit, history: [change], change })

		expect([...store.agentChanges().components]).toEqual(["R1"])
		expect(store.lastChange()).toEqual(change)
		vi.advanceTimersByTime(DEFAULT_UI_CONFIG.agentHighlightMs)
		expect(store.agentChanges().components.size).toBe(0)
	})

	test("the learner's own changes are not highlighted", () => {
		const withResistor = applyCommand(sharedCircuit, { type: "add-component", component: { type: "resistor" } })
		if (!withResistor.ok) throw new Error("setup failed")
		const change = { revision: 1, author: "learner" as const, summary: 'Added resistor "R1"' }
		serverSends({ revision: 1, circuit: withResistor.circuit, history: [change], change })

		expect(store.agentChanges().components.size).toBe(0)
	})

	test("reconnecting to a restarted, empty server sends it the learner's circuit instead of losing it", () => {
		store.apply({ type: "add-component", component: { type: "resistor" } })
		serverSends({ revision: 1, circuit: { ...sharedCircuit, components: store.circuit().components }, history: [] })
		live.listener?.closed()
		store.apply({ type: "add-component", component: { type: "ground" } })

		serverSends({ revision: 0, circuit: createCircuit("Untitled"), history: [] })
		expect(live.sent.at(-1)).toMatchObject({ type: "replace", circuit: { components: [{ id: "R1" }, { id: "GND1" }] } })
		expect(store.circuit().components.map((component) => component.id)).toEqual(["R1", "GND1"])
	})

	test("joining with a circuit restored from this session sends it to a server that came back empty", () => {
		TestBed.resetTestingModule()
		TestBed.configureTestingModule({ providers: [{ provide: LiveLink, useClass: FakeLiveLink }] })
		store = TestBed.inject(CircuitStore)
		live = TestBed.inject(LiveLink) as unknown as FakeLiveLink
		store.replace(createCircuit("Mine"), "Restored your last circuit")
		store.apply({ type: "add-component", component: { type: "capacitor" } })

		store.joinLive("ws://127.0.0.1:5000/?token=t", { keepLocal: true })
		serverSends({ revision: 0, circuit: createCircuit("Untitled"), history: [] })

		expect(live.sent.at(-1)).toMatchObject({ type: "replace", circuit: { components: [{ id: "C1" }] } })
		expect(store.circuit().components.map((component) => component.id)).toEqual(["C1"])
	})

	test("turning the dial while linked sends edits marked with the turn, so the server keeps it as one undo step", () => {
		store.apply({ type: "add-component", component: { type: "resistor", params: { resistance: 1000 } } })
		serverSends({ revision: 1, circuit: { ...sharedCircuit, components: store.circuit().components }, history: [] })
		store.turnDial("R1", 1, "turn-9")
		expect(live.sent.at(-1)).toMatchObject({ type: "edit", gesture: "turn-9", command: { type: "set-parameter", componentId: "R1", value: 1200 } })
	})

	test("reconnecting to a server that has its own work shows the server's circuit", () => {
		live.listener?.closed()
		store.apply({ type: "add-component", component: { type: "ground" } })
		const agentBuilt = applyCommand(sharedCircuit, { type: "add-component", component: { type: "resistor" } })
		if (!agentBuilt.ok) throw new Error("setup failed")
		serverSends({ revision: 3, circuit: agentBuilt.circuit, history: [] })
		expect(store.circuit().components.map((component) => component.id)).toEqual(["R1"])
	})

	test("edits made while the link was down and then replaced are announced, and can be sent instead", () => {
		live.listener?.closed()
		store.apply({ type: "add-component", component: { type: "ground" } })
		const agentBuilt = applyCommand(sharedCircuit, { type: "add-component", component: { type: "resistor" } })
		if (!agentBuilt.ok) throw new Error("setup failed")
		serverSends({ revision: 3, circuit: agentBuilt.circuit, history: [] })
		expect(store.offlineCopy()?.components.map((component) => component.id)).toEqual(["GND1"])

		store.useOfflineCopy()
		expect(live.sent.at(-1)).toMatchObject({ type: "replace", circuit: { components: [{ id: "GND1" }] }, summary: "Used the learner's offline changes" })
		expect(store.offlineCopy()).toBeUndefined()
	})

	test("nothing is announced when nothing changed while the link was down, or when dismissed", () => {
		live.listener?.closed()
		serverSends({ revision: 1, circuit: sharedCircuit, history: [] })
		expect(store.offlineCopy()).toBeUndefined()

		live.listener?.closed()
		store.apply({ type: "add-component", component: { type: "ground" } })
		serverSends({ revision: 2, circuit: sharedCircuit, history: [] })
		store.dismissOfflineCopy()
		expect(store.offlineCopy()).toBeUndefined()
	})

	test("Reconnect tries the link again at once", () => {
		store.reconnectLive()
		expect(live.reconnects).toBe(1)
	})

	test("when the link closes, the app keeps the shared circuit and works alone", () => {
		live.listener?.closed()
		expect(store.circuit().name).toBe("Shared")

		store.apply({ type: "add-component", component: { type: "ground" } })
		expect(live.sent).toEqual([])
		expect(store.circuit().components.map((component) => component.id)).toEqual(["GND1"])
	})
})

test("a part can be watched on the oscilloscope without a probe, and leaves it when deleted", () => {
	expect(store.scopeTraces()).toEqual([])
	store.toggleWatch("R2")
	expect(store.scopeTraces()).toEqual([{ id: "R2", pins: ["a", "b"] }])
	expect(store.isWatched("R2")).toBe(true)
	store.toggleWatch("R2")
	expect(store.scopeTraces()).toEqual([])
	store.toggleWatch("R2")
	store.selection.set({ kind: "component", id: "R2" })
	store.removeSelected()
	expect(store.scopeTraces()).toEqual([])
})

test("redo puts back what undo took away", () => {
	store.apply({ type: "set-parameter", componentId: "R2", name: "resistance", value: 4 })
	store.undo()
	expect(store.circuit().components.find((part) => part.id === "R2")?.params).toMatchObject({ resistance: 2 })
	store.redo()
	expect(store.circuit().components.find((part) => part.id === "R2")?.params).toMatchObject({ resistance: 4 })
	store.redo()
	expect(store.editError()).toBe("Nothing to redo")
})

test("notes join a group: select all, move, copy, paste and delete take them along", () => {
	store.addNote("Ohm's law")
	const [note] = store.circuit().notes
	store.selectAll()
	expect([...store.multiNotes()]).toEqual([note?.id])
	store.moveParts(store.selectedParts(), { x: 20, y: 40 }, store.multiNotes())
	expect(store.circuit().notes[0]?.position).toEqual({ x: (note?.position.x ?? 0) + 20, y: (note?.position.y ?? 0) + 40 })
	expect(store.history().at(-1)?.summary).toBe("Moved 4 parts and 1 note")

	store.copySelection()
	store.paste()
	expect(store.circuit().notes).toHaveLength(2)
	expect(store.multiNotes().size).toBe(1)
	expect(store.multiNotes().has(note?.id ?? "")).toBe(false)
	store.removeSelected()
	expect(store.circuit().notes).toHaveLength(1)
	expect(store.circuit().components).toHaveLength(4)
	store.clearSelection()
	expect(store.multiNotes().size).toBe(0)
})

test("a group turns a quarter turn clockwise about its middle, as one change", () => {
	// R1 at (160, 0) and R2 at (320, 100): the middle (240, 50) on the grid is (240, 60).
	store.toggleInSelection("R1")
	store.toggleInSelection("R2")
	store.rotateSelected()
	const part = (id: string) => store.circuit().components.find((component) => component.id === id)
	expect(part("R1")).toMatchObject({ position: { x: 300, y: -20 }, rotation: 90 })
	expect(part("R2")).toMatchObject({ position: { x: 200, y: 140 }, rotation: 180 })
	expect(store.history().at(-1)?.summary).toBe("Rotated 2 parts")
	store.undo()
	expect(part("R1")).toMatchObject({ position: { x: 160, y: 0 }, rotation: 0 })
})

test("a group becomes a chip that works the same, selected; unpacking it brings the parts back, selected", () => {
	// The example: 6 V over R1 (1 Ω) and R2 (2 Ω); R2 gets 4 V.
	store.toggleInSelection("R1")
	store.toggleInSelection("R2")
	store.makeChip("Pair")
	expect(store.circuit().components.map((part) => part.id)).toEqual(["V1", "GND1", "X1"])
	expect(store.selectedComponent()?.id).toBe("X1")
	expect(store.solution()?.readings["X1.R2"]?.voltage).toBeCloseTo(4, 9)

	store.renameChipPin("pair", "R1_a", "top")
	expect(store.circuit().subcircuits[0]?.pins.map((pin) => pin.name)).toContain("top")

	store.unpackChip("X1")
	expect(store.circuit().components.map((part) => part.id).sort()).toEqual(["GND1", "R1", "R2", "V1"])
	expect([...store.multiSelection()].sort()).toEqual(["R1", "R2"])
	expect(store.solution()?.readings["R2"]?.voltage).toBeCloseTo(4, 9)
})
