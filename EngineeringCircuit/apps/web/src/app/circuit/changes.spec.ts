import { createCircuit } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { changedIds } from "./changes"
import { kvlExample } from "./examples"

test("new and edited parts and wires count as changed; untouched ones don't", () => {
	const before = kvlExample()
	const after = structuredClone(before)
	const [first] = after.components
	if (first?.type === "voltage-source") first.params.voltage = 9
	after.wires = after.wires.slice(1)
	after.wires.push({ id: "w9", from: { componentId: "R1", pin: "a" }, to: { componentId: "R2", pin: "b" }, bends: [] })

	const result = changedIds(before, after)
	expect([...result.components]).toEqual(["V1"])
	expect([...result.wires]).toEqual(["w9"])
})

test("an empty circuit has nothing changed", () => {
	expect(changedIds(createCircuit("a"), createCircuit("b"))).toEqual({ components: new Set(), wires: new Set() })
})
