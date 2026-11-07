import { describe, expect, test } from "vitest"
import { createCircuit } from "../../src/schema/circuit"
import { voltageDivider } from "../fixtures/voltage-divider"
import { parseCircuit, parseCircuitJson, serializeCircuit } from "../../src/io/parse"

const errorsOf = (input: unknown) => {
	const result = parseCircuit(input)
	if (result.ok) throw new Error("expected parse to fail")
	return result.errors
}

describe("valid circuits", () => {
	test("empty circuit parses", () => {
		expect(parseCircuit(createCircuit("Empty"))).toEqual({ ok: true, circuit: createCircuit("Empty") })
	})

	test("voltage divider survives a save/load round trip", () => {
		const result = parseCircuitJson(serializeCircuit(voltageDivider()))
		expect(result).toEqual({ ok: true, circuit: voltageDivider() })
	})
})

describe("header", () => {
	test("rejects a file from another app", () => {
		expect(errorsOf({ format: "something-else", version: 1 })).toEqual([
			{ path: "format", message: "Not an engineering-circuit file" },
		])
	})

	test("rejects a newer version with an update hint", () => {
		const [error] = errorsOf({ ...voltageDivider(), version: 2 })
		expect(error?.message).toContain("Update the app")
	})

	test.each([0, 1.5, "1"])("rejects invalid version %j", (version) => {
		expect(errorsOf({ ...voltageDivider(), version })[0]?.path).toBe("version")
	})

	test("reports invalid JSON text", () => {
		const result = parseCircuitJson("{ not json")
		expect(result.ok).toBe(false)
	})
})

describe("component errors", () => {
	test("negative resistance points at the exact field", () => {
		const circuit = voltageDivider()
		const resistor = circuit.components[1]
		if (resistor?.type !== "resistor") throw new Error("fixture changed")
		resistor.params.resistance = -5

		expect(errorsOf(circuit).map((error) => error.path)).toEqual(["components[1].params.resistance"])
	})

	test("misspelled parameter is rejected, not ignored", () => {
		const circuit = voltageDivider() as unknown as { components: { params: Record<string, unknown> }[] }
		circuit.components[1]!.params = { resistence: 1000 }

		const paths = errorsOf(circuit).map((error) => error.path)
		expect(paths).toContain("components[1].params")
	})

	test("unknown component type explains it may need a newer app", () => {
		const circuit = voltageDivider() as unknown as { components: { type: string }[] }
		circuit.components[0]!.type = "flux-capacitor"

		expect(errorsOf(circuit)).toEqual([
			{
				path: "components[0].type",
				message: 'Unknown component type "flux-capacitor". It may come from a newer version; update the app.',
			},
		])
	})
})

describe("reference errors", () => {
	test("duplicate ids", () => {
		const circuit = voltageDivider()
		circuit.components[2]!.id = "R1"
		circuit.wires[1]!.id = "w1"

		expect(errorsOf(circuit)).toEqual(
			expect.arrayContaining([
				{ path: "components", message: 'Duplicate component id "R1"' },
				{ path: "wires", message: 'Duplicate wire id "w1"' },
			]),
		)
	})

	test("wire to a missing component", () => {
		const circuit = voltageDivider()
		circuit.wires[0]!.to.componentId = "R9"

		expect(errorsOf(circuit)).toEqual([{ path: "wires[0].to", message: 'Unknown component "R9"' }])
	})

	test("wire to a pin the component does not have", () => {
		const circuit = voltageDivider()
		circuit.wires[0]!.from.pin = "plus"

		expect(errorsOf(circuit)).toEqual([
			{ path: "wires[0].from", message: 'voltage-source has no pin "plus" (valid: positive, negative)' },
		])
	})

	test("wire from a pin to itself", () => {
		const circuit = voltageDivider()
		circuit.wires[0]!.to = { componentId: "V1", pin: "positive" }

		expect(errorsOf(circuit)).toEqual([{ path: "wires[0]", message: "Wire connects a pin to itself" }])
	})
})
