import { TestBed } from "@angular/core/testing"
import { createCircuit } from "@engineering-circuit/format"
import { beforeEach, expect, test } from "vitest"
import { CircuitStore } from "../circuit/circuit-store"
import { LessonProgress } from "./lesson-progress"

let store: CircuitStore
let progress: LessonProgress

beforeEach(() => {
	store = TestBed.inject(CircuitStore)
	progress = TestBed.inject(LessonProgress)
	store.replace({ ...createCircuit("Light an LED safely"), lesson: "light-an-led" }, "Started lesson")
})

test("the lesson comes from the circuit, and a check is kept until the circuit changes", () => {
	expect(progress.lesson()?.id).toBe("light-an-led")
	progress.check()
	expect(progress.result()?.passed).toBe(false)
	expect(progress.stale()).toBe(false)

	store.addNote("My first try")
	expect(progress.stale()).toBe(false)
	store.apply({ type: "add-component", component: { type: "resistor" } })
	expect(progress.result()).toBeDefined()
	expect(progress.stale()).toBe(true)
})

test("hints shown are forgotten when another lesson starts", () => {
	progress.showHint(1)
	expect(progress.shownHints().has(1)).toBe(true)
	store.replace({ ...createCircuit("Half adder"), lesson: "half-adder" }, "Started lesson")
	expect(progress.shownHints().size).toBe(0)
	expect(progress.result()).toBeUndefined()
})
