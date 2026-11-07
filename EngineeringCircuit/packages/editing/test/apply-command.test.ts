import { type Circuit, createCircuit } from "@engineering-circuit/format"
import { describe, expect, test } from "vitest"
import { type EditCommand, applyCommand } from "../src/apply-command"

const run = (circuit: Circuit, ...commands: EditCommand[]): Circuit =>
	commands.reduce((current, command) => {
		const result = applyCommand(current, command)
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		return result.circuit
	}, circuit)

const errorsOf = (circuit: Circuit, command: EditCommand) => {
	const result = applyCommand(circuit, command)
	if (result.ok) throw new Error("expected the command to be rejected")
	return result.errors
}

const battery: EditCommand = { type: "add-component", component: { type: "voltage-source", params: { voltage: 9 } } }
const resistor: EditCommand = { type: "add-component", component: { type: "resistor", params: { resistance: 1000 } } }

describe("add-component", () => {
	test("numbers ids per type: V1, R1, R2", () => {
		const circuit = run(createCircuit("t"), battery, resistor, resistor)
		expect(circuit.components.map((component) => component.id)).toEqual(["V1", "R1", "R2"])
	})

	test("keeps a given id", () => {
		const circuit = run(createCircuit("t"), {
			type: "add-component",
			component: { id: "Rload", type: "resistor", params: { resistance: 50 } },
		})
		expect(circuit.components[0]?.id).toBe("Rload")
	})

	test("places parts on a grid so they don't stack", () => {
		const circuit = run(createCircuit("t"), battery, resistor)
		expect(circuit.components.map((component) => component.position)).toEqual([
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
		])
	})

	test("summarises the change", () => {
		const result = applyCommand(createCircuit("t"), resistor)
		expect(result.ok && result.summary).toBe('Added resistor "R1"')
	})

	test("rejects a duplicate id", () => {
		const circuit = run(createCircuit("t"), resistor)
		const errors = errorsOf(circuit, {
			type: "add-component",
			component: { id: "R1", type: "resistor", params: { resistance: 5 } },
		})
		expect(errors).toEqual([{ path: "components", message: 'Duplicate component id "R1"' }])
	})

	test("rejects invalid params with the format's message", () => {
		const errors = errorsOf(createCircuit("t"), {
			type: "add-component",
			component: { type: "resistor", params: { resistance: -1 } },
		})
		expect(errors.map((error) => error.path)).toEqual(["components[0].params.resistance"])
	})
})

describe("connect / disconnect", () => {
	const base = () => run(createCircuit("t"), battery, resistor)

	test("connects two pins with a numbered wire", () => {
		const circuit = run(base(), {
			type: "connect",
			from: { componentId: "V1", pin: "positive" },
			to: { componentId: "R1", pin: "a" },
		})
		expect(circuit.wires).toEqual([
			{ id: "w1", from: { componentId: "V1", pin: "positive" }, to: { componentId: "R1", pin: "a" }, bends: [] },
		])
	})

	test("rejects an unknown pin with the valid pin names", () => {
		const errors = errorsOf(base(), {
			type: "connect",
			from: { componentId: "V1", pin: "plus" },
			to: { componentId: "R1", pin: "a" },
		})
		expect(errors[0]?.message).toBe('voltage-source has no pin "plus" (valid: positive, negative)')
	})

	test("rejects wiring the same two pins twice", () => {
		const connect: EditCommand = {
			type: "connect",
			from: { componentId: "V1", pin: "positive" },
			to: { componentId: "R1", pin: "a" },
		}
		const reversed: EditCommand = { type: "connect", from: connect.to, to: connect.from }
		expect(errorsOf(run(base(), connect), reversed)).toEqual([
			{ path: "wires", message: "V1.positive and R1.a are already connected by wire w1" },
		])
	})

	test("disconnect removes the wire", () => {
		const connected = run(base(), {
			type: "connect",
			from: { componentId: "V1", pin: "positive" },
			to: { componentId: "R1", pin: "a" },
		})
		expect(run(connected, { type: "disconnect", wireId: "w1" }).wires).toEqual([])
	})

	test("disconnect of an unknown wire is rejected", () => {
		expect(errorsOf(base(), { type: "disconnect", wireId: "w9" })).toEqual([
			{ path: "wires", message: 'No wire with id "w9"' },
		])
	})
})

describe("set-parameter", () => {
	test("changes a value", () => {
		const circuit = run(createCircuit("t"), resistor, {
			type: "set-parameter",
			componentId: "R1",
			name: "resistance",
			value: 2200,
		})
		expect(circuit.components[0]).toMatchObject({ params: { resistance: 2200 } })
	})

	test("rejects an invalid value", () => {
		const circuit = run(createCircuit("t"), resistor)
		const errors = errorsOf(circuit, { type: "set-parameter", componentId: "R1", name: "resistance", value: 0 })
		expect(errors.map((error) => error.path)).toEqual(["components[0].params.resistance"])
	})

	test("rejects a parameter the part doesn't have", () => {
		const circuit = run(createCircuit("t"), resistor)
		const errors = errorsOf(circuit, { type: "set-parameter", componentId: "R1", name: "voltage", value: 5 })
		expect(errors.map((error) => error.path)).toEqual(["components[0].params"])
	})

	test("rejects an unknown component", () => {
		expect(
			errorsOf(createCircuit("t"), { type: "set-parameter", componentId: "R7", name: "resistance", value: 1 }),
		).toEqual([{ path: "components", message: 'No component with id "R7"' }])
	})
})

describe("remove-component", () => {
	test("removes the part and every wire attached to it", () => {
		const circuit = run(
			createCircuit("t"),
			battery,
			resistor,
			{ type: "connect", from: { componentId: "V1", pin: "positive" }, to: { componentId: "R1", pin: "a" } },
			{ type: "remove-component", componentId: "R1" },
		)
		expect(circuit.components.map((component) => component.id)).toEqual(["V1"])
		expect(circuit.wires).toEqual([])
	})
})

test("commands never modify the circuit they were given", () => {
	const circuit = run(createCircuit("t"), resistor)
	const snapshot = structuredClone(circuit)
	applyCommand(circuit, { type: "set-parameter", componentId: "R1", name: "resistance", value: 7 })
	expect(circuit).toEqual(snapshot)
})
