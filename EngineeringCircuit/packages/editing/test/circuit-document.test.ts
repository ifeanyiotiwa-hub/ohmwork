import { createCircuit } from "@ohmwork/format"
import { describe, expect, test } from "vitest"
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

	expect(document.undo("agent")).toEqual({ ok: true, summary: "Undid: Set R1 resistance to 220 (by agent)" })
	expect(document.circuit.components[0]).toMatchObject({ params: { resistance: 100 } })
	expect(document.history).toHaveLength(1)
})

test("undo with no history says so", () => {
	expect(new CircuitDocument(createCircuit("t")).undo("learner")).toEqual({ ok: false, message: "Nothing to undo" })
})

test("replace swaps in a whole circuit as one undoable change", () => {
	const document = new CircuitDocument(createCircuit("old"))
	document.replace(createCircuit("new"), "agent", "Opened new.json")

	expect(document.circuit.name).toBe("new")
	document.undo("learner")
	expect(document.circuit.name).toBe("old")
})

test("every change bumps the revision and notifies subscribers with its author", () => {
	const document = new CircuitDocument(createCircuit("t"))
	const changes: unknown[] = []
	document.subscribe((change) => changes.push(change))

	document.apply(addResistor, "agent")
	document.apply({ type: "remove-component", componentId: "X1" }, "agent")
	document.undo("learner")
	document.replace(createCircuit("new"), "learner", "New circuit")

	expect(document.revision).toBe(3)
	expect(changes).toEqual([
		{ revision: 1, author: "agent", summary: 'Added resistor "R1"' },
		{ revision: 2, author: "learner", summary: 'Undid: Added resistor "R1" (by agent)' },
		{ revision: 3, author: "learner", summary: "New circuit" },
	])
})

test("an unsubscribed listener hears nothing more", () => {
	const document = new CircuitDocument(createCircuit("t"))
	const changes: unknown[] = []
	const unsubscribe = document.subscribe((change) => changes.push(change))
	unsubscribe()

	document.apply(addResistor, "agent")
	expect(changes).toEqual([])
})

test("history keeps only the last `historyLimit` changes; undo stops there", () => {
	const document = new CircuitDocument(createCircuit("t"), { historyLimit: 2 })
	for (let count = 0; count < 3; count++) document.apply({ type: "add-component", component: { type: "resistor" } }, "learner")
	expect(document.history).toHaveLength(2)
	expect(document.undo("learner").ok).toBe(true)
	expect(document.undo("learner").ok).toBe(true)
	expect(document.undo("learner")).toEqual({ ok: false, message: "Nothing to undo" })
	expect(document.circuit.components.map((component) => component.id)).toEqual(["R1"])
})

describe("a gesture (turning a value dial) is one history step", () => {
	const setR = (value: number) => ({ type: "set-parameter", componentId: "R1", name: "resistance", value }) as const
	const withResistor = () => {
		const document = new CircuitDocument(createCircuit("t"))
		document.apply({ type: "add-component", component: { type: "resistor", params: { resistance: 1000 } } }, "learner")
		return document
	}

	test("edits with the same gesture merge into one entry; one undo goes back to before the gesture", () => {
		const document = withResistor()
		for (const value of [1200, 1500, 1800]) document.apply(setR(value), "learner", { gesture: "dial-1" })
		expect(document.history).toHaveLength(2)
		expect(document.history.at(-1)?.summary).toContain("1800")
		document.undo("learner")
		expect(document.circuit.components[0]?.params).toMatchObject({ resistance: 1000 })
	})

	test("a new gesture, another author's edit in between, or no gesture each start a new entry", () => {
		const document = withResistor()
		document.apply(setR(1200), "learner", { gesture: "dial-1" })
		document.apply(setR(1500), "learner", { gesture: "dial-2" })
		document.apply(setR(1800), "agent", { gesture: "dial-2" })
		document.apply(setR(2200), "learner", { gesture: "dial-2" })
		document.apply(setR(2700), "learner")
		expect(document.history).toHaveLength(6)
	})

	test("every merged edit still counts as a change for listeners (the app and the agent see each step)", () => {
		const document = withResistor()
		const revisions: number[] = []
		document.subscribe((change) => revisions.push(change.revision))
		for (const value of [1200, 1500]) document.apply(setR(value), "learner", { gesture: "dial-1" })
		expect(revisions).toEqual([2, 3])
	})
})

test("redo puts back what undo took away, in order; a new change ends the chance", () => {
	const document = new CircuitDocument(createCircuit("t"))
	document.apply(addResistor, "learner")
	document.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: 220 }, "agent")
	const changed = document.circuit
	document.undo("learner")
	document.undo("learner")
	expect(document.circuit.components).toEqual([])

	expect(document.redo("learner")).toEqual({ ok: true, summary: 'Redid: Added resistor "R1" (by learner)' })
	expect(document.redo("agent")).toEqual({ ok: true, summary: "Redid: Set R1 resistance to 220 (by agent)" })
	expect(document.circuit).toBe(changed)
	expect(document.history).toHaveLength(2)
	expect(document.redo("learner")).toEqual({ ok: false, message: "Nothing to redo" })

	document.undo("learner")
	document.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: 330 }, "learner")
	expect(document.redo("learner")).toEqual({ ok: false, message: "Nothing to redo" })
	expect(document.canRedo).toBe(false)
})
