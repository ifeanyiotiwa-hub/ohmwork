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

test("wire currents follow the loop", () => {
	expect(store.wireCurrents()["w1"]).toBeCloseTo(2, 9)
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

	test("when the link closes, the app keeps the shared circuit and works alone", () => {
		live.listener?.closed()
		expect(store.circuit().name).toBe("Shared")

		store.apply({ type: "add-component", component: { type: "ground" } })
		expect(live.sent).toEqual([])
		expect(store.circuit().components.map((component) => component.id)).toEqual(["GND1"])
	})
})
