import { TestBed } from "@angular/core/testing"
import { beforeEach, expect, test } from "vitest"
import { CircuitStore } from "./circuit-store"

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
	expect(store.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: -1 })).toBe(false)
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
