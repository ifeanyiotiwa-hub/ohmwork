import { describe, expect, test } from "vitest"
import { CURRENT_VERSION, createCircuit } from "../../src/schema/circuit"
import { voltageDivider } from "../fixtures/voltage-divider"
import { parseCircuit, parseCircuitJson, serializeCircuit } from "../../src/io/parse"

/** Older files had no ratings: strip the resistors' power rating to make one. */
const withoutRatings = (components: ReturnType<typeof voltageDivider>["components"]) =>
	components.map((component) =>
		component.type === "resistor" ? { ...component, params: { resistance: component.params.resistance } } : component,
	)

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

describe("older files", () => {
	/** Today's divider as an old file becomes: the same, but stepping fixed (version 10 keeps old files' stepping). */
	const migratedDivider = () => ({ ...voltageDivider(), simulation: { ...voltageDivider().simulation, stepping: "fixed" } })

	test("a version 1 file opens with the default simulation settings (and fixed steps, as it was made with)", () => {
		const { simulation: _settings, notes: _notes, ...circuit } = voltageDivider()
		const result = parseCircuit({ ...circuit, version: 1, components: withoutRatings(circuit.components) })
		expect(result).toEqual({ ok: true, circuit: migratedDivider() })
	})

	test("a version 3 file gains the 5 V logic level", () => {
		const { simulation, notes: _notes, ...circuit } = voltageDivider()
		const { logicHigh: _level, ...older } = simulation
		expect(parseCircuit({ ...circuit, version: 3, simulation: older, components: withoutRatings(circuit.components) })).toEqual({
			ok: true,
			circuit: migratedDivider(),
		})
	})

	test("a version 4 file gains an empty list of notes", () => {
		const { notes: _notes, ...circuit } = voltageDivider()
		expect(parseCircuit({ ...circuit, version: 4, components: withoutRatings(circuit.components) })).toEqual({ ok: true, circuit: migratedDivider() })
	})

	test("a version 5 file gains ratings: ¼ W resistors, 1 A diodes, 30 mA LEDs (their electrical values stay)", () => {
		const at = { position: { x: 0, y: 0 }, rotation: 0 }
		const led = { color: "blue", saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 }
		const result = parseCircuit({
			...createCircuit("Old"),
			version: 5,
			components: [
				{ id: "R1", type: "resistor", ...at, params: { resistance: 100 } },
				{ id: "D1", type: "diode", ...at, params: { saturationCurrent: 1e-14, emissionCoefficient: 1, seriesResistance: 0 } },
				{ id: "LED1", type: "led", ...at, params: led },
			],
		})
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		expect(result.circuit.components.map((component) => component.params)).toEqual([
			{ resistance: 100, powerRating: 0.25 },
			{ saturationCurrent: 1e-14, emissionCoefficient: 1, seriesResistance: 0, maxCurrent: 1 },
			{ ...led, maxCurrent: 0.03 },
		])
	})

	test("a version 8 op-amp stays ideal (bandwidth, slew and current far beyond any circuit); new ones are LM741s", () => {
		const result = parseCircuit({
			...createCircuit("Old"),
			version: 8,
			components: [{ id: "U1", type: "op-amp", position: { x: 0, y: 0 }, rotation: 0, params: { gain: 100000, supplyHigh: 15, supplyLow: -15 } }],
		})
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		expect(result.circuit.components[0]?.params).toEqual({
			gain: 100000,
			supplyHigh: 15,
			supplyLow: -15,
			gainBandwidth: 1e15,
			slewRate: 1e15,
			maxOutputCurrent: 1e6,
		})
	})

	test("a version 7 file's Zeners, transistors and MOSFETs gain datasheet ratings (their electrical values stay)", () => {
		const at = { position: { x: 0, y: 0 }, rotation: 0 }
		const transistor = { beta: 100, betaReverse: 1, saturationCurrent: 1e-13 }
		const mosfet = { thresholdVoltage: 1.5, transconductance: 0.02 }
		const noDynamics = { earlyVoltage: 1e15, emitterCapacitance: 0, collectorCapacitance: 0, transitTime: 0, reverseTransitTime: 0 }
		const result = parseCircuit({
			...createCircuit("Old"),
			version: 7,
			components: [
				{ id: "DZ1", type: "zener-diode", ...at, params: { saturationCurrent: 1e-14, emissionCoefficient: 1, seriesResistance: 0, breakdownVoltage: 5.6 } },
				{ id: "Q1", type: "npn-transistor", ...at, params: transistor },
				{ id: "QP1", type: "pnp-transistor", ...at, params: transistor },
				{ id: "M1", type: "n-mosfet", ...at, params: mosfet },
				{ id: "MP1", type: "p-mosfet", ...at, params: mosfet },
			],
		})
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		expect(result.circuit.components.map((component) => component.params)).toEqual([
			{ saturationCurrent: 1e-14, emissionCoefficient: 1, seriesResistance: 0, breakdownVoltage: 5.6, maxCurrent: 0.162 },
			// …and, from version 9, no Early effect or stored charge (they behave as before).
			{ ...transistor, maxCurrent: 0.2, maxPower: 0.625, ...noDynamics },
			{ ...transistor, maxCurrent: 0.2, maxPower: 0.625, ...noDynamics },
			{ ...mosfet, maxCurrent: 0.17, maxPower: 0.37, gateSourceCapacitance: 0, gateDrainCapacitance: 0 },
			{ ...mosfet, maxCurrent: 0.13, maxPower: 0.3, gateSourceCapacitance: 0, gateDrainCapacitance: 0 },
		])
	})

	test("a version 6 RGB LED keeps its one model for every colour (it behaves as before) and gains the datasheet ratings", () => {
		const shared = { saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042 }
		const result = parseCircuit({
			...createCircuit("Old"),
			version: 6,
			components: [
				{ id: "RGB1", type: "rgb-led", position: { x: 0, y: 0 }, rotation: 0, params: { commonCathode: false, ...shared, maxBrightnessCurrent: 0.01 } },
			],
		})
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		expect(result.circuit.components[0]?.params).toEqual({
			commonCathode: false,
			emissionCoefficient: 3.73,
			seriesResistance: 0.042,
			redSaturationCurrent: 93.2e-12,
			greenSaturationCurrent: 93.2e-12,
			blueSaturationCurrent: 93.2e-12,
			redMaxCurrent: 0.03,
			greenMaxCurrent: 0.025,
			blueMaxCurrent: 0.03,
			maxBrightnessCurrent: 0.01,
		})
	})

	test("version 2 diodes and LEDs gain electrical parameters; the LED keeps its colour", () => {
		const at = { position: { x: 0, y: 0 }, rotation: 0 }
		const result = parseCircuit({
			...createCircuit("Old"),
			version: 2,
			components: [
				{ id: "D1", type: "diode", ...at, params: {} },
				{ id: "LED1", type: "led", ...at, params: { color: "green" } },
			],
		})
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		expect(result.circuit.components.map((component) => component.params)).toEqual([
			{ saturationCurrent: 1.7143528192808883e-7, emissionCoefficient: 2, seriesResistance: 0, maxCurrent: 1 },
			{ color: "green", saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01, maxCurrent: 0.03 },
		])
	})
})

describe("simulation settings", () => {
	test("time step and speed must be positive", () => {
		const errors = errorsOf({ ...createCircuit("t"), simulation: { timeStep: 0, speed: -1, logicHigh: 5, temperature: 27, stepping: "adaptive" } })
		expect(errors.map((error) => error.path)).toEqual(["simulation.timeStep", "simulation.speed"])
	})
})

describe("header", () => {
	test("rejects a file from another app", () => {
		expect(errorsOf({ format: "something-else", version: 1 })).toEqual([
			{ path: "format", message: "Not an engineering-circuit file" },
		])
	})

	test("rejects a newer version with an update hint", () => {
		const [error] = errorsOf({ ...voltageDivider(), version: CURRENT_VERSION + 1 })
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

describe("notes and lessons", () => {
	test("a circuit keeps text notes and the lesson it belongs to", () => {
		const circuit = { ...createCircuit("t"), lesson: "light-an-led", notes: [{ id: "note1", position: { x: 10, y: 20 }, text: "Current flows this way" }] }
		expect(parseCircuit(circuit)).toEqual({ ok: true, circuit })
	})

	test("notes need text and unique ids", () => {
		const note = { id: "note1", position: { x: 0, y: 0 }, text: "Hi" }
		expect(errorsOf({ ...createCircuit("t"), notes: [note, note] })).toEqual([{ path: "notes", message: 'Duplicate note id "note1"' }])
		expect(errorsOf({ ...createCircuit("t"), notes: [{ ...note, text: "" }] })[0]?.path).toBe("notes[0].text")
	})
})
