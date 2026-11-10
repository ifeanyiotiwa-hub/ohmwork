import { applyCommand } from "@ohmwork/editing"
import { expect, test } from "vitest"
import { copyParts, pasteCommand } from "./clipboard"
import { kvlExample } from "./examples"

test("copying takes the chosen parts and only the wires between them", () => {
	const copied = copyParts(kvlExample(), new Set(["R1", "R2"]))
	expect(copied.components.map((component) => component.id)).toEqual(["R1", "R2"])
	expect(copied.wires.map((wire) => wire.id)).toEqual(["w2"])
})

test("pasting adds renumbered parts, shifted, wired as they were, in one change", () => {
	const circuit = kvlExample()
	const command = pasteCommand(circuit, copyParts(circuit, new Set(["R1", "R2"])), { x: 40, y: 40 })
	if (!command) throw new Error("expected a paste command")
	const result = applyCommand(circuit, command)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expect(result.summary).toBe("Pasted 2 parts")
	const pasted = result.circuit.components.slice(-2)
	expect(pasted.map((component) => component.id)).toEqual(["R3", "R4"])
	expect(pasted[0]?.position).toEqual({ x: 200, y: 40 })
	expect(pasted[0]?.params).toEqual(circuit.components.find((component) => component.id === "R1")?.params)
	expect(result.circuit.wires.at(-1)).toMatchObject({ from: { componentId: "R3", pin: "b" }, to: { componentId: "R4", pin: "a" } })
})

test("nothing copied pastes nothing", () => {
	const circuit = kvlExample()
	expect(pasteCommand(circuit, copyParts(circuit, new Set()), { x: 40, y: 40 })).toBeUndefined()
})

test("notes are copied and pasted with the parts, shifted the same", () => {
	const circuit = { ...kvlExample(), notes: [{ id: "note1", position: { x: 0, y: 300 }, text: "Ohm's law" }] }
	const copied = copyParts(circuit, new Set(["R1"]), new Set(["note1"]))
	expect(copied.notes.map((note) => note.id)).toEqual(["note1"])
	const command = pasteCommand(circuit, copied, { x: 40, y: 40 })
	if (!command) throw new Error("expected a paste command")
	const result = applyCommand(circuit, command)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expect(result.summary).toBe("Pasted 1 part and 1 note")
	expect(result.circuit.notes.at(-1)).toMatchObject({ text: "Ohm's law", position: { x: 40, y: 340 } })
	const notesOnly = pasteCommand(circuit, copyParts(circuit, new Set(), new Set(["note1"])), { x: 40, y: 40 })
	expect(notesOnly?.summary).toBe("Pasted 1 note")
})
