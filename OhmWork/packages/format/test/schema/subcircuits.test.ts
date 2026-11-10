import { describe, expect, test } from "vitest"
import { parseCircuit } from "../../src/io/parse"
import { chipPinOffsets, pinPosition } from "../../src/layout/pins"
import { expandSubcircuits, pinsOfPart } from "../../src/schema/subcircuits"
import { buildNets, pinKey } from "../../src/topology/nets"
import { circuitWithChip, dividerChip } from "../fixtures/divider-chip"

const errorsOf = (input: unknown) => {
	const result = parseCircuit(input)
	if (result.ok) throw new Error("expected parse to fail")
	return result.errors.map((error) => error.message)
}

describe("parsing chips", () => {
	test("a circuit with a chip parses, and its pins are the chip's", () => {
		const result = parseCircuit(circuitWithChip())
		expect(result).toEqual({ ok: true, circuit: circuitWithChip() })
		const chip = circuitWithChip().components[1]
		if (!chip) throw new Error("no chip")
		expect(pinsOfPart(chip, circuitWithChip())).toEqual(["top", "mid", "bottom"])
	})

	test("a version 10 file gains an empty list of chips", () => {
		const { subcircuits: _none, ...old } = { ...circuitWithChip(), components: [], wires: [], subcircuits: [] }
		const result = parseCircuit({ ...old, version: 10 })
		expect(result.ok && result.circuit.subcircuits).toEqual([])
	})

	test("broken chips are reported: unknown definition, a pin to nothing, a wire to a pin the chip lacks, a chip inside itself", () => {
		const unknown = circuitWithChip()
		unknown.components[1] = { ...unknown.components[1], params: { definition: "nope" } } as (typeof unknown.components)[number]
		expect(errorsOf(unknown)).toContainEqual(expect.stringContaining('No chip "nope"'))

		const loosePin = circuitWithChip()
		loosePin.subcircuits = [{ ...dividerChip(), pins: [{ name: "top", to: { componentId: "R9", pin: "a" } }] }]
		expect(errorsOf(loosePin)).toContainEqual(expect.stringContaining('"R9"'))

		const badWire = circuitWithChip()
		badWire.wires.push({ id: "w4", from: { componentId: "X1", pin: "side" }, to: { componentId: "GND1", pin: "terminal" }, bends: [] })
		expect(errorsOf(badWire)).toContainEqual(expect.stringContaining('has no pin "side" (valid: top, mid, bottom)'))

		const looped = circuitWithChip()
		const self = dividerChip()
		looped.subcircuits = [{ ...self, components: [...self.components, { id: "X1", type: "subcircuit", position: { x: 0, y: 0 }, rotation: 0, params: { definition: "divider" } }] }]
		expect(errorsOf(looped)).toContainEqual(expect.stringContaining("inside itself"))
	})

	test("a dot in a part's id is refused: it is how parts inside chips are named", () => {
		const dotted = circuitWithChip()
		dotted.components[0] = { ...dotted.components[0], id: "V.1" } as (typeof dotted.components)[number]
		expect(errorsOf(dotted)).toContainEqual(expect.stringContaining('"V.1"'))
	})
})

describe("expanding chips", () => {
	test("a chip's parts and wires join the circuit under its name, and its pins join the parts they stand for", () => {
		const expanded = expandSubcircuits(circuitWithChip())
		expect(expanded.components.map((part) => part.id)).toEqual(["V1", "X1", "GND1", "X1.R1", "X1.R2"])
		expect(expanded.wires.map((wire) => wire.id)).toEqual(["w1", "w2", "w3", "X1.w1"])
		const nets = buildNets(expanded).map((net) => net.pins.map(pinKey).sort())
		expect(nets).toContainEqual(["V1:positive", "X1.R1:a", "X1:top"])
		expect(nets).toContainEqual(["X1.R1:b", "X1.R2:a", "X1:mid"])
	})

	test("chips inside chips expand too, named by the path to them", () => {
		const circuit = circuitWithChip()
		circuit.subcircuits.push({
			id: "pair",
			name: "Pair",
			pins: [{ name: "in", to: { componentId: "X1", pin: "top" } }],
			components: [{ id: "X1", type: "subcircuit", position: { x: 0, y: 0 }, rotation: 0, params: { definition: "divider" } }],
			wires: [],
		})
		circuit.components.push({ id: "X2", type: "subcircuit", position: { x: 400, y: 0 }, rotation: 0, params: { definition: "pair" } })
		const ids = expandSubcircuits(circuit).components.map((part) => part.id)
		expect(ids).toEqual(expect.arrayContaining(["X2", "X2.X1", "X2.X1.R1", "X2.X1.R2"]))
	})

	test("expanding is cached and an expanded circuit is left as it is", () => {
		const circuit = circuitWithChip()
		const expanded = expandSubcircuits(circuit)
		expect(expandSubcircuits(circuit)).toBe(expanded)
		expect(expandSubcircuits(expanded)).toBe(expanded)
	})
})

test("a chip's pins sit on its two sides, first half on the left, 20 apart", () => {
	expect(chipPinOffsets(dividerChip().pins.map((pin) => pin.name))).toEqual({
		top: { x: -40, y: -10 },
		mid: { x: -40, y: 10 },
		bottom: { x: 40, y: 0 },
	})
	const circuit = circuitWithChip()
	const chip = circuit.components[1]
	if (!chip) throw new Error("no chip")
	expect(pinPosition(chip, "bottom", chip.position, circuit.subcircuits)).toEqual({ x: 240, y: 0 })
})
