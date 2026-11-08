import { type Circuit, LED_MODELS, createCircuit } from "@engineering-circuit/format"
import { describe, expect, test } from "vitest"
import { applyCommand } from "../src/apply-command"
import type { EditCommand } from "../src/edit-command"

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

	test("fills missing params from the catalog defaults", () => {
		const circuit = run(
			createCircuit("t"),
			{ type: "add-component", component: { type: "resistor" } },
			{ type: "add-component", component: { type: "voltage-source", params: { voltage: 12 } } },
		)
		expect(circuit.components.map((component) => component.params)).toEqual([{ resistance: 1000, powerRating: 0.25 }, { voltage: 12 }])
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

describe("move and rotate", () => {
	test("moves a part to a new position", () => {
		const circuit = run(createCircuit("t"), resistor, {
			type: "move-component",
			componentId: "R1",
			position: { x: 240, y: 60 },
		})
		expect(circuit.components[0]?.position).toEqual({ x: 240, y: 60 })
	})

	test("moving a part re-routes its wires (bends are cleared), other wires keep theirs", () => {
		const bend = { x: 50, y: 50 }
		const circuit = run(createCircuit("t"), battery, resistor, resistor)
		const withBends = {
			...circuit,
			wires: [
				{ id: "w1", from: { componentId: "V1", pin: "positive" }, to: { componentId: "R1", pin: "a" }, bends: [bend] },
				{ id: "w2", from: { componentId: "R1", pin: "b" }, to: { componentId: "R2", pin: "a" }, bends: [bend] },
			],
		}
		const moved = run(withBends, { type: "move-component", componentId: "V1", position: { x: 0, y: 200 } })
		expect(moved.wires.map((wire) => wire.bends)).toEqual([[], [bend]])

		const rotated = run(withBends, { type: "rotate-component", componentId: "R2" })
		expect(rotated.wires.map((wire) => wire.bends)).toEqual([[bend], []])
	})

	test("rotates a quarter turn clockwise, wrapping after 270", () => {
		const rotate: EditCommand = { type: "rotate-component", componentId: "R1" }
		const circuit = run(createCircuit("t"), resistor, rotate, rotate, rotate, rotate, rotate)
		expect(circuit.components[0]?.rotation).toBe(90)
	})

	test("turns to an exact angle when one is given", () => {
		const circuit = run(createCircuit("t"), resistor, { type: "rotate-component", componentId: "R1", rotation: 270 })
		expect(circuit.components[0]?.rotation).toBe(270)
	})

	test("rejects an unknown component", () => {
		expect(errorsOf(createCircuit("t"), { type: "rotate-component", componentId: "Q1" })).toEqual([
			{ path: "components", message: 'No component with id "Q1"' },
		])
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

describe("equivalent quantities", () => {
	const ac = { type: "add-component", component: { type: "ac-source" } } as const

	test("a period is stored as its frequency", () => {
		const circuit = run(createCircuit("t"), ac, { type: "set-parameter", componentId: "AC1", name: "period", value: 0.02 })
		expect(circuit.components[0]?.params).toMatchObject({ frequency: 50 })
		expect(circuit.components[0]?.params).not.toHaveProperty("period")
	})

	test("an RMS voltage is stored as its peak", () => {
		const circuit = run(createCircuit("t"), ac, { type: "set-parameter", componentId: "AC1", name: "rms", value: 230 })
		expect(circuit.components[0]?.params).toMatchObject({ amplitude: 230 * Math.SQRT2 })
	})

	test("new parts accept them too", () => {
		const circuit = run(createCircuit("t"), {
			type: "add-component",
			component: { type: "square-source", params: { period: 0.5 } },
		})
		expect(circuit.components[0]?.params).toMatchObject({ frequency: 2 })
	})

	test("a part without the matching quantity keeps the usual error", () => {
		expect(errorsOf(run(createCircuit("t"), resistor), { type: "set-parameter", componentId: "R1", name: "period", value: 1 }).length).toBeGreaterThan(0)
	})
})

describe("set-simulation", () => {
	test("changes the time step and speed", () => {
		const circuit = run(createCircuit("t"), { type: "set-simulation", timeStep: 1e-6, speed: 0.5 })
		expect(circuit.simulation).toEqual({ timeStep: 1e-6, speed: 0.5, logicHigh: 5 })
		expect(run(circuit, { type: "set-simulation", logicHigh: 3.3 }).simulation.logicHigh).toBe(3.3)
	})

	test("rejects a time step of zero", () => {
		expect(errorsOf(createCircuit("t"), { type: "set-simulation", timeStep: 0 })[0]?.path).toBe("simulation.timeStep")
	})
})

describe("rename-circuit", () => {
	test("renames the circuit", () => {
		const circuit = run(createCircuit("Old"), { type: "rename-circuit", name: "Night light" })
		expect(circuit.name).toBe("Night light")
		expect(applyCommand(createCircuit("Old"), { type: "rename-circuit", name: "Night light" })).toMatchObject({
			summary: 'Renamed the circuit "Night light"',
		})
	})

	test("rejects an empty name", () => {
		expect(errorsOf(createCircuit("Old"), { type: "rename-circuit", name: "  " })).toEqual([
			{ path: "name", message: "A circuit needs a name" },
		])
	})
})

describe("notes", () => {
	const addNote: EditCommand = { type: "add-note", note: { text: "Current flows clockwise", position: { x: 40, y: 60 } } }

	test("adds a numbered note, edits its text, moves and removes it", () => {
		const added = run(createCircuit("t"), addNote, addNote)
		expect(added.notes.map((note) => note.id)).toEqual(["note1", "note2"])
		const edited = run(added, { type: "edit-note", noteId: "note1", text: "Electrons go the other way" })
		expect(edited.notes[0]?.text).toBe("Electrons go the other way")
		const moved = run(edited, { type: "move-note", noteId: "note1", position: { x: 0, y: 0 } })
		expect(moved.notes[0]?.position).toEqual({ x: 0, y: 0 })
		expect(run(moved, { type: "remove-note", noteId: "note1" }).notes.map((note) => note.id)).toEqual(["note2"])
	})

	test("summaries quote the note", () => {
		expect(applyCommand(createCircuit("t"), addNote)).toMatchObject({ summary: 'Added note "Current flows clockwise"' })
	})

	test("a note needs text, and a missing note is named", () => {
		expect(errorsOf(createCircuit("t"), { type: "add-note", note: { text: "" } })[0]?.path).toBe("notes[0].text")
		expect(errorsOf(createCircuit("t"), { type: "remove-note", noteId: "note9" })).toEqual([
			{ path: "notes", message: 'No note with id "note9"' },
		])
	})
})

describe("LED colours", () => {
	test("a new LED of a colour gets that colour's model", () => {
		const circuit = run(createCircuit("t"), { type: "add-component", component: { type: "led", params: { color: "blue" } } })
		expect(circuit.components[0]?.params).toMatchObject({ color: "blue", ...LED_MODELS.blue })
	})

	test("changing the colour of an untouched LED changes its model too", () => {
		const circuit = run(
			createCircuit("t"),
			{ type: "add-component", component: { type: "led" } },
			{ type: "set-parameter", componentId: "LED1", name: "color", value: "white" },
		)
		expect(circuit.components[0]?.params).toMatchObject({ color: "white", ...LED_MODELS.white })
	})

	test("an LED whose electrical values were customised keeps them when recoloured", () => {
		const circuit = run(
			createCircuit("t"),
			{ type: "add-component", component: { type: "led" } },
			{ type: "set-parameter", componentId: "LED1", name: "saturationCurrent", value: 1e-15 },
			{ type: "set-parameter", componentId: "LED1", name: "color", value: "green" },
		)
		expect(circuit.components[0]?.params).toMatchObject({ color: "green", saturationCurrent: 1e-15, maxCurrent: LED_MODELS.red.maxCurrent })
	})
})
