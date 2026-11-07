import { createCircuit } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { CircuitDocument } from "../src/circuit-document"

const addResistor = { type: "add-component", component: { type: "resistor", params: { resistance: 100 } } } as const

test("records who made each change", () => {
	const document = new CircuitDocument(createCircuit("t"))
	document.apply(addResistor, "learner")
	document.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: 220 }, "agent")

	expect(document.history).toEqual([
		{ author: "learner", summary: 'Added resistor "R1"' },
		{ author: "agent", summary: 'Set R1 resistance to 220' },
	])
})

test("a rejected change leaves the circuit and history untouched", () => {
	const document = new CircuitDocument(createCircuit("t"))
	const result = document.apply({ type: "remove-component", componentId: "X1" }, "agent")

	expect(result.ok).toBe(false)
	expect(document.circuit.components).toEqual([])
	expect(document.history).toEqual([])
})

test("undo restores the previous circuit and reports what was undone", () => {
	const document = new CircuitDocument(createCircuit("t"))
	document.apply(addResistor, "learner")
	document.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: 220 }, "agent")

	expect(document.undo()).toEqual({ ok: true, summary: "Undid: Set R1 resistance to 220 (by agent)" })
	expect(document.circuit.components[0]).toMatchObject({ params: { resistance: 100 } })
	expect(document.history).toHaveLength(1)
})

test("undo with no history says so", () => {
	expect(new CircuitDocument(createCircuit("t")).undo()).toEqual({ ok: false, message: "Nothing to undo" })
})

test("replace swaps in a whole circuit as one undoable change", () => {
	const document = new CircuitDocument(createCircuit("old"))
	document.replace(createCircuit("new"), "agent", "Opened new.json")

	expect(document.circuit.name).toBe("new")
	document.undo()
	expect(document.circuit.name).toBe("old")
})
