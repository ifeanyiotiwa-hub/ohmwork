import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CircuitDocument } from "@ohmwork/editing"
import { createCircuit } from "@ohmwork/format"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { LiveServer } from "../src/live/live-server"
import { DEFAULT_OPTIONS, type ServerOptions } from "../src/options"
import { type ServerContext, createServer } from "../src/server"

type ToolOutput = { isError: boolean; text: string; data: unknown }

let client: Client
let document: CircuitDocument

async function start(context: ServerContext, options: Partial<ServerOptions> = {}): Promise<void> {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	await createServer({ ...DEFAULT_OPTIONS, workspaceDirectory: process.cwd(), ...options }, context).connect(serverTransport)
	client = new Client({ name: "test-client", version: "1.0.0" })
	await client.connect(clientTransport)
}

beforeEach(async () => {
	document = new CircuitDocument(createCircuit("Untitled"))
	await start({ document })
})

afterEach(async () => {
	await client.close()
})

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolOutput> {
	const result = await client.callTool({ name, arguments: args })
	const [first] = result.content
	const text = first?.type === "text" ? first.text : ""
	let data: unknown = text
	try {
		data = JSON.parse(text)
	} catch {
		data = text
	}
	return { isError: result.isError === true, text, data }
}

async function buildVoltageDivider() {
	await call("create_circuit", { name: "Divider" })
	await call("add_component", { type: "voltage-source", params: { voltage: 10 } })
	await call("add_component", { type: "resistor", params: { resistance: 1000 } })
	await call("add_component", { type: "resistor", params: { resistance: 1000 } })
	await call("add_component", { type: "ground", params: {} })
	await call("connect", { from: "V1.positive", to: "R1.a" })
	await call("connect", { from: "R1.b", to: "R2.a" })
	await call("connect", { from: "R2.b", to: "V1.negative" })
	await call("connect", { from: "V1.negative", to: "GND1.terminal" })
}

test("offers the build, inspect and file tools", async () => {
	const { tools } = await client.listTools()
	expect(tools.map((tool) => tool.name).sort()).toEqual([
		"add_component",
		"add_note",
		"check_solution",
		"connect",
		"create_circuit",
		"disconnect",
		"explain_circuit",
		"frequency_response",
		"get_circuit",
		"lesson_format",
		"list_component_types",
		"list_lessons",
		"load_lesson",
		"make_chip",
		"move_component",
		"open_circuit",
		"open_in_app",
		"part_request_guide",
		"probe",
		"recent_changes",
		"redo",
		"remove_component",
		"remove_note",
		"rename_circuit",
		"rotate_component",
		"save_circuit",
		"save_lesson_draft",
		"save_part_request",
		"set_parameter",
		"set_simulation",
		"simulate",
		"simulate_over_time",
		"undo",
	])
})

test("list_component_types describes pins, parameter units and simulation support", async () => {
	const { data } = await call("list_component_types")
	expect(data).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				type: "resistor",
				idPrefix: "R",
				pins: ["a", "b"],
				simulated: true,
				params: expect.objectContaining({
					properties: expect.objectContaining({ resistance: expect.objectContaining({ description: "ohms" }) }),
				}),
			}),
			expect.objectContaining({ type: "diode", simulated: true, defaults: expect.objectContaining({ emissionCoefficient: 2 }) }),
		]),
	)
})

describe("a voltage divider built through the tools", () => {
	test("simulates to 5 V in the middle", async () => {
		await buildVoltageDivider()
		const { isError, data } = await call("simulate")

		expect(isError).toBe(false)
		expect(data).toMatchObject({
			nodes: expect.arrayContaining([{ name: "N2", voltage: 5, pins: ["R1.b", "R2.a"] }]),
			components: expect.arrayContaining([{ id: "R1", type: "resistor", voltage: 5, current: 0.005, power: 0.025 }]),
			warnings: [],
		})
	})

	test("make_chip turns parts into a chip that works the same; parts inside read by path, and more copies can be placed", async () => {
		await buildVoltageDivider()
		const made = await call("make_chip", {
			componentIds: ["R1", "R2"],
			name: "Divider",
			pins: [
				{ name: "top", pin: "R1.a" },
				{ name: "bottom", pin: "R2.b" },
			],
		})
		expect(made.isError).toBe(false)
		expect(made.text).toContain('Made chip "Divider" (X1)')
		expect((await call("probe", { target: "X1.R1" })).data).toMatchObject({ voltage: 5, current: 0.005 })
		expect((await call("probe", { target: "X1.R1.b" })).data).toMatchObject({ voltage: 5 })
		expect((await call("probe", { target: "X1.top" })).data).toMatchObject({ voltage: 10 })
		expect((await call("probe", { target: "X1.side" })).text).toContain("valid: top, bottom")

		expect((await call("add_component", { type: "subcircuit", params: { definition: "divider" } })).isError).toBe(false)
		expect((await call("connect", { from: "X2.top", to: "V1.positive" })).isError).toBe(false)
		expect((await call("add_component", { type: "subcircuit", params: { definition: "nope" } })).text).toContain('No chip "nope"')
	})

	test("net labels of the same name connect, with no wire between them", async () => {
		await call("add_component", { type: "voltage-source", params: { voltage: 9 } })
		await call("add_component", { type: "net-label", params: { name: "VCC" } })
		await call("add_component", { type: "net-label", params: { name: "VCC" } })
		await call("add_component", { type: "resistor", params: { resistance: 1000 } })
		await call("add_component", { type: "ground" })
		await call("connect", { from: "V1.positive", to: "NL1.terminal" })
		await call("connect", { from: "NL2.terminal", to: "R1.a" })
		await call("connect", { from: "R1.b", to: "GND1.terminal" })
		await call("connect", { from: "V1.negative", to: "GND1.terminal" })
		expect((await call("probe", { target: "R1" })).data).toMatchObject({ voltage: 9, current: 0.009 })
		expect((await call("set_parameter", { componentId: "NL2", name: "name", value: "OTHER" })).isError).toBe(false)
		expect((await call("probe", { target: "R1" })).data).toMatchObject({ current: 0 })
	})

	test("a motor's speed is reported in rpm (FAULHABER 2224U012SR at 12 V: 7770 rpm, ngspice 813.73 rad/s)", async () => {
		await call("add_component", { type: "voltage-source", params: { voltage: 12 } })
		await call("add_component", { type: "dc-motor" })
		await call("add_component", { type: "ground" })
		await call("connect", { from: "V1.positive", to: "MOT1.a" })
		await call("connect", { from: "MOT1.b", to: "GND1.terminal" })
		await call("connect", { from: "V1.negative", to: "GND1.terminal" })
		const { data } = await call("simulate_over_time", { duration: 0.1, probes: ["MOT1"], samples: 1 })
		expect(data).toMatchObject({ samples: [{ values: { MOT1: { speedRpm: expect.closeTo(7770, -1), current: expect.closeTo(0.0136, 3) } } }] })
	})

	test("probe reads a part or a single pin", async () => {
		await buildVoltageDivider()

		expect((await call("probe", { target: "R2" })).data).toEqual({
			target: "R2",
			voltage: 5,
			current: 0.005,
			power: 0.025,
		})
		expect((await call("probe", { target: "R1.b" })).data).toEqual({ target: "R1.b", voltage: 5 })
	})

	test("explain_circuit gives the agent real facts to teach from", async () => {
		await buildVoltageDivider()
		const { data } = await call("explain_circuit")

		expect(data).toMatchObject({
			name: "Divider",
			components: expect.arrayContaining([
				{ id: "R1", type: "resistor", params: { resistance: { value: 1000, unit: "ohms" }, powerRating: expect.objectContaining({ value: 0.25 }) } },
			]),
			nodes: expect.arrayContaining([{ name: "ground", voltage: 0, pins: ["V1.negative", "R2.b", "GND1.terminal"] }]),
			simulation: expect.objectContaining({ ok: true }),
			history: expect.arrayContaining([{ author: "agent", summary: "Connected R1.b to R2.a" }]),
		})
	})

	test("set_parameter and undo change and restore the circuit", async () => {
		await buildVoltageDivider()
		await call("set_parameter", { componentId: "R2", name: "resistance", value: 3000 })
		expect((await call("probe", { target: "R1.b" })).data).toMatchObject({ voltage: 7.5 })

		expect((await call("undo")).text).toBe("Undid: Set R2 resistance to 3000 (by agent)")
		expect((await call("probe", { target: "R1.b" })).data).toMatchObject({ voltage: 5 })
		expect((await call("redo")).text).toBe("Redid: Set R2 resistance to 3000 (by agent)")
		expect((await call("probe", { target: "R1.b" })).data).toMatchObject({ voltage: 7.5 })
		expect((await call("redo")).isError).toBe(true)
	})
})

test("mistakes come back as clear errors, not crashes", async () => {
	await call("create_circuit", { name: "Oops" })
	await call("add_component", { type: "voltage-source", params: { voltage: 9 } })

	const badPin = await call("connect", { from: "V1.plus", to: "V1.negative" })
	expect(badPin.isError).toBe(true)
	expect(badPin.text).toContain('voltage-source has no pin "plus" (valid: positive, negative)')

	await call("connect", { from: "V1.positive", to: "V1.negative" })
	const shorted = await call("simulate")
	expect(shorted.isError).toBe(true)
	expect(shorted.text).toContain("Short circuit")

	const unknown = await call("probe", { target: "R9" })
	expect(unknown.isError).toBe(true)
	expect(unknown.text).toContain('No component with id "R9"')
})

describe("files", () => {
	let directory: string

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "engineering-circuit-"))
		await client.close()
		await start({ document }, { workspaceDirectory: directory })
	})

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true })
	})

	test("a part request is checked, then saved for review as Markdown in the workspace", async () => {
		const guide = await call("part_request_guide")
		expect(guide.data).toMatchObject({ categories: expect.arrayContaining(["Passive"]), takenPrefixes: expect.arrayContaining(["R"]) })

		const request = {
			type: "thermistor",
			name: "Thermistor (NTC)",
			category: "Passive",
			idPrefix: "TH",
			pins: ["a", "b"],
			params: [{ name: "resistance", kind: "positive", unit: "ohms", description: "at 25 °C", default: 10000 }],
			model: "resistor that falls as it warms (B equation)",
			seenIn: "CJS",
			sources: [{ title: "Vishay NTCLE100E3 datasheet", url: "https://www.vishay.com/docs/29049/ntcle100.pdf" }],
		}
		const refused = await call("save_part_request", { request: { ...request, type: "resistor", sources: [] } })
		expect(refused.isError).toBe(true)
		expect(refused.text).toContain("already a part")
		expect(refused.text).toContain("source")

		const saved = await call("save_part_request", { request })
		expect(saved.isError).toBe(false)
		const written = await readFile(join(directory, "part-requests", "thermistor.md"), "utf8")
		expect(written).toContain("# Part request: Thermistor (NTC) (`thermistor`)")
		expect(written).toContain('resistance: positive("ohms, at 25 °C")')
	})

	test("a drafted lesson is saved for review only when the agent's circuit passes it and an empty one does not", async () => {
		const format = await call("lesson_format")
		expect(format.data).toMatchObject({ schema: { type: "object" }, rules: expect.arrayContaining([expect.stringContaining("reference")]) })

		await buildVoltageDivider()
		const lesson = {
			id: "divide-by-two",
			title: "Halve a voltage",
			level: "beginner",
			kind: "lesson",
			summary: "Two equal resistors split a voltage in half.",
			goal: "Make 5 V from a 10 V source.",
			steps: [{ text: "Use two equal resistors.", hint: "The middle sits at R2 ÷ (R1 + R2) of the supply." }],
			checks: [{ kind: "node-voltage", between: [4.9, 5.1], description: "Some point sits at 5 V" }],
		}
		const saved = await call("save_lesson_draft", { lesson })
		expect(saved.isError).toBe(false)
		const written = JSON.parse(await readFile(join(directory, "lesson-drafts", "divide-by-two.json"), "utf8"))
		expect(written).toMatchObject({ lesson: { id: "divide-by-two" }, referenceSolution: { components: expect.any(Array) } })

		const wrong = await call("save_lesson_draft", { lesson: { ...lesson, checks: [{ kind: "node-voltage", between: [7, 8], description: "Some point sits at 7.5 V" }] } })
		expect(wrong.isError).toBe(true)
		expect(wrong.text).toContain("Some point sits at 7.5 V")

		const trivial = await call("save_lesson_draft", { lesson: { ...lesson, checks: [{ kind: "no-errors", description: "It simulates" }] } })
		expect(trivial.text).toContain("empty circuit")
		expect((await call("save_lesson_draft", { lesson: { ...lesson, id: "half-adder" } })).text).toContain("already a lesson")
	})

	test("save then open restores the circuit", async () => {
		await buildVoltageDivider()
		const path = "divider.json"

		expect((await call("save_circuit", { path })).isError).toBe(false)
		await call("create_circuit", { name: "Blank" })
		expect((await call("open_circuit", { path })).isError).toBe(false)

		expect((await call("probe", { target: "R1.b" })).data).toMatchObject({ voltage: 5 })
	})

	test("opening an invalid file reports why", async () => {
		const result = await call("open_circuit", { path: "missing.json" })
		expect(result.isError).toBe(true)
		expect(result.text).toContain("Could not read")
	})

	test("files outside the workspace folder are refused, by a relative or an absolute path", async () => {
		// Never a real system file: before the check existed, save_circuit would have written there.
		for (const path of ["../outside.json", join(tmpdir(), "outside.json")]) {
			for (const tool of ["save_circuit", "open_circuit"]) {
				const result = await call(tool, { path })
				expect(result.isError).toBe(true)
				expect(result.text).toContain("outside the workspace folder")
			}
		}
	})

	test("an absolute path inside the workspace folder is fine, and so is a name that merely starts with dots", async () => {
		expect((await call("save_circuit", { path: join(directory, "inside.json") })).isError).toBe(false)
		expect((await call("save_circuit", { path: "..draft.json" })).isError).toBe(false)
	})

	test("a file over the size limit is not opened", async () => {
		await call("save_circuit", { path: "big.json" })
		await client.close()
		await start({ document }, { workspaceDirectory: directory, maxFileBytes: 10 })
		const result = await call("open_circuit", { path: "big.json" })
		expect(result.isError).toBe(true)
		expect(result.text).toContain("the limit is 10")
	})
})

describe("live link", () => {
	test("open_in_app explains how to turn the link on when it is off", async () => {
		const result = await call("open_in_app")
		expect(result.isError).toBe(true)
		expect(result.text).toContain("live link is off")
	})

	test("open_in_app gives the learner a link to the same circuit", async () => {
		const live = await LiveServer.start(document, { ...DEFAULT_OPTIONS.live, maxMessageBytes: 1024 })
		try {
			await client.close()
			await start({ document, live })
			const result = await call("open_in_app")
			expect(result.isError).toBe(false)
			expect(result.text).toContain(live.link)
		} finally {
			await live.close()
		}
	})

	test("recent_changes shows the learner's edits since the agent last asked", async () => {
		await call("add_component", { type: "resistor" })
		document.apply({ type: "set-parameter", componentId: "R1", name: "resistance", value: 220 }, "learner")

		expect((await call("recent_changes")).data).toEqual({
			revision: 2,
			changes: [
				{ revision: 1, author: "agent", summary: 'Added resistor "R1"' },
				{ revision: 2, author: "learner", summary: "Set R1 resistance to 220" },
			],
		})

		document.undo("learner")
		expect((await call("recent_changes")).data).toEqual({
			revision: 3,
			changes: [{ revision: 3, author: "learner", summary: "Undid: Set R1 resistance to 220 (by learner)" }],
		})
		expect((await call("recent_changes")).data).toEqual({ revision: 3, changes: [] })
	})
})

describe("layout", () => {
	test("list_component_types gives each pin's offset at rotation 0", async () => {
		const { data } = await call("list_component_types")
		expect(data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "resistor", pinOffsets: { a: { x: -40, y: 0 }, b: { x: 40, y: 0 } } }),
			]),
		)
	})

	test("parts can be placed rotated, moved and turned, and get_circuit reports where every pin is", async () => {
		await call("add_component", { type: "voltage-source", x: 0, y: 100, rotation: 90 })
		await call("add_component", { type: "resistor", x: 100, y: 0 })

		expect((await call("move_component", { componentId: "R1", x: 160, y: 60 })).text).toBe("Moved R1 to (160, 60)")
		expect((await call("rotate_component", { componentId: "R1", rotation: 270 })).text).toBe("Rotated R1 to 270°")

		const { data } = await call("get_circuit")
		expect(data).toMatchObject({
			circuit: { components: [{ id: "V1", rotation: 90 }, { id: "R1", position: { x: 160, y: 60 }, rotation: 270 }] },
			pinPositions: {
				"V1.positive": { x: 0, y: 60 },
				"V1.negative": { x: 0, y: 140 },
				"R1.a": { x: 160, y: 100 },
				"R1.b": { x: 160, y: 20 },
			},
		})
	})

	test("rotate_component without an angle turns a quarter turn", async () => {
		await call("add_component", { type: "resistor" })
		expect((await call("rotate_component", { componentId: "R1" })).text).toBe("Rotated R1 to 90°")
	})

	test("moving or turning a missing part is a clear error", async () => {
		const moved = await call("move_component", { componentId: "R7", x: 0, y: 0 })
		expect(moved.isError).toBe(true)
		expect(moved.text).toContain('No component with id "R7"')
	})
})

describe("meters and push buttons", () => {
	test("an ohmmeter reports ohms, or open when nothing is between its leads", async () => {
		await call("add_component", { type: "ohmmeter" })
		await call("add_component", { type: "resistor", params: { resistance: 470 } })
		await call("connect", { from: "OM1.a", to: "R1.a" })
		expect((await call("probe", { target: "OM1" })).data).toMatchObject({ resistance: "open (nothing connects its leads)" })

		await call("connect", { from: "R1.b", to: "OM1.b" })
		expect((await call("probe", { target: "OM1" })).data).toMatchObject({ resistance: 470 })
	})

	test("simulate and probe can hold push buttons down", async () => {
		await call("add_component", { type: "voltage-source", params: { voltage: 5 } })
		await call("add_component", { type: "push-button" })
		await call("add_component", { type: "resistor", params: { resistance: 1000 } })
		await call("add_component", { type: "ground" })
		await call("connect", { from: "V1.positive", to: "PB1.a" })
		await call("connect", { from: "PB1.b", to: "R1.a" })
		await call("connect", { from: "R1.b", to: "GND1.terminal" })
		await call("connect", { from: "V1.negative", to: "GND1.terminal" })

		expect((await call("probe", { target: "R1" })).data).toMatchObject({ current: 0 })
		expect((await call("probe", { target: "R1", pressed: ["PB1"] })).data).toMatchObject({ current: 0.005 })
		const simulated = (await call("simulate", { pressed: ["PB1"] })).data
		expect(simulated).toMatchObject({ components: expect.arrayContaining([expect.objectContaining({ id: "R1", current: 0.005 })]) })
	})
})

describe("frequency response", () => {
	async function buildLowPass() {
		await call("add_component", { type: "ac-source", params: { amplitude: 2 } })
		await call("add_component", { type: "resistor", params: { resistance: 1000 } })
		await call("add_component", { type: "capacitor", params: { capacitance: 1e-6 } })
		await call("add_component", { type: "ground" })
		await call("connect", { from: "AC1.positive", to: "R1.a" })
		await call("connect", { from: "R1.b", to: "C1.a" })
		await call("connect", { from: "C1.b", to: "GND1.terminal" })
		await call("connect", { from: "AC1.negative", to: "GND1.terminal" })
	}

	test("frequency_response gives gain and phase relative to the AC source (ngspice: -3.0103 dB, -45° at 159.155 Hz)", async () => {
		await buildLowPass()
		const { data, isError } = await call("frequency_response", { output: "C1.a", start: 159.155, stop: 1591.55, pointsPerDecade: 1 })
		expect(isError).toBe(false)
		expect(data).toMatchObject({
			input: "AC1",
			points: [
				{ frequency: 159.155, gainDb: expect.closeTo(-3.0103, 3), phaseDegrees: expect.closeTo(-45, 2) },
				{ frequency: expect.closeTo(1591.55, 2), gainDb: expect.closeTo(-20.04, 1) },
			],
		})
		const across = await call("frequency_response", { output: "R1", start: 159.155, stop: 159.155 })
		expect(across.data).toMatchObject({ points: [{ gainDb: expect.closeTo(-3.0103, 3), phaseDegrees: expect.closeTo(45, 2) }] })
	})

	test("frequency_response needs an AC source and a real pin, and bounds the points", async () => {
		await buildVoltageDivider()
		expect((await call("frequency_response", { output: "R2.a", start: 10, stop: 1000 })).text).toContain("AC source")
		await call("create_circuit", { name: "low-pass" })
		await buildLowPass()
		expect((await call("frequency_response", { output: "C9.a", start: 10, stop: 1000 })).isError).toBe(true)
		expect((await call("frequency_response", { output: "C1.a", start: 1000, stop: 10 })).isError).toBe(true)
		expect((await call("frequency_response", { output: "C1.a", start: 1e-3, stop: 1e12, pointsPerDecade: 100 })).text).toContain("points")
	})
})

describe("over time", () => {
	async function buildRc() {
		await call("add_component", { type: "voltage-source", params: { voltage: 5 } })
		await call("add_component", { type: "resistor", params: { resistance: 1000 } })
		await call("add_component", { type: "capacitor", params: { capacitance: 1e-6 } })
		await call("add_component", { type: "ground" })
		await call("connect", { from: "V1.positive", to: "R1.a" })
		await call("connect", { from: "R1.b", to: "C1.a" })
		await call("connect", { from: "C1.b", to: "GND1.terminal" })
		await call("connect", { from: "V1.negative", to: "GND1.terminal" })
	}

	test("simulate_over_time samples probes as a capacitor charges", async () => {
		await buildRc()
		const { data, isError } = await call("simulate_over_time", { duration: 0.005, probes: ["C1", "R1.a"], samples: 5 })
		expect(isError).toBe(false)
		expect(data).toMatchObject({
			timeStep: 5e-6,
			samples: [
				{ time: 0.001, values: { C1: { voltage: expect.closeTo(3.1606, 3) }, "R1.a": { voltage: 5 } } },
				{ time: 0.002 },
				{ time: 0.003 },
				{ time: 0.004 },
				{ time: 0.005, values: { C1: { voltage: expect.closeTo(4.96631, 3) } } },
			],
		})
	})

	test("a run that would take too many steps is refused with a way forward", async () => {
		await buildRc()
		const result = await call("simulate_over_time", { duration: 1000, probes: ["C1"] })
		expect(result.isError).toBe(true)
		expect(result.text).toContain("set_simulation")
	})

	test("set_simulation changes the time step and speed, and period is accepted for frequency", async () => {
		expect((await call("set_simulation", { timeStep: 1e-6, speed: 0.001 })).text).toBe("Simulation: time step 0.000001 s, speed 0.001, logic high 5 V, 27 °C, adaptive steps")
		await call("add_component", { type: "ac-source" })
		expect((await call("set_parameter", { componentId: "AC1", name: "period", value: 0.01 })).text).toBe("Set AC1 frequency to 100")
	})
})

describe("multi-port parts", () => {
	test("probing a controlled source reports each of its ports", async () => {
		await call("add_component", { type: "voltage-source", params: { voltage: 3 } })
		await call("add_component", { type: "resistor", params: { resistance: 1000 } })
		await call("add_component", { type: "vcvs", params: { gain: 2 } })
		await call("add_component", { type: "resistor", params: { resistance: 1000 } })
		await call("add_component", { type: "ground" })
		await call("connect", { from: "V1.positive", to: "R1.a" })
		await call("connect", { from: "R1.b", to: "GND1.terminal" })
		await call("connect", { from: "V1.negative", to: "GND1.terminal" })
		await call("connect", { from: "E1.controlPositive", to: "V1.positive" })
		await call("connect", { from: "E1.controlNegative", to: "GND1.terminal" })
		await call("connect", { from: "E1.positive", to: "R2.a" })
		await call("connect", { from: "E1.negative", to: "GND1.terminal" })
		await call("connect", { from: "R2.b", to: "GND1.terminal" })

		expect((await call("probe", { target: "E1" })).data).toMatchObject({ target: "E1", ports: { output: { voltage: 6, current: -0.006 } } })
		expect((await call("simulate")).data).toMatchObject({
			components: expect.arrayContaining([expect.objectContaining({ id: "E1", ports: { output: expect.objectContaining({ voltage: 6 }) } })]),
		})
	})
})

test("probing a transistor reports base-emitter and collector-emitter", async () => {
	await call("add_component", { type: "voltage-source", params: { voltage: 10 } })
	await call("add_component", { type: "voltage-source", params: { voltage: 2 } })
	await call("add_component", { type: "resistor", params: { resistance: 1000 } })
	await call("add_component", { type: "resistor", params: { resistance: 100000 } })
	// No Early effect, to compare with the D4 ngspice values (npn.cir has none).
	await call("add_component", { type: "npn-transistor", params: { earlyVoltage: 1e15 } })
	await call("add_component", { type: "ground" })
	await call("connect", { from: "V1.positive", to: "R1.a" })
	await call("connect", { from: "R1.b", to: "Q1.collector" })
	await call("connect", { from: "V2.positive", to: "R2.a" })
	await call("connect", { from: "R2.b", to: "Q1.base" })
	await call("connect", { from: "Q1.emitter", to: "GND1.terminal" })
	await call("connect", { from: "V1.negative", to: "GND1.terminal" })
	await call("connect", { from: "V2.negative", to: "GND1.terminal" })

	expect((await call("probe", { target: "Q1" })).data).toMatchObject({
		target: "Q1",
		ports: {
			"base-emitter": { voltage: expect.closeTo(0.604, 2) },
			"collector-emitter": { voltage: expect.closeTo(8.604, 2), current: expect.closeTo(0.0013958, 5) },
		},
	})
})

test("the agent can watch a counter count with simulate_over_time", async () => {
	await call("add_component", { type: "clock", params: { frequency: 1000 } })
	await call("add_component", { type: "counter-4bit" })
	await call("connect", { from: "CLK1.out", to: "CNT1.clk" })
	const { data } = await call("simulate_over_time", { duration: 0.0035, probes: ["CNT1.q0", "CNT1.q1"], samples: 1 })
	// Rising edges at 0, 1, 2, 3 ms: a count of 4 (q0 = 0, q1 = 0 → bit 2 set).
	expect(data).toMatchObject({ samples: [{ values: { "CNT1.q0": { voltage: 0 }, "CNT1.q1": { voltage: 0 } } }] })
	const more = await call("simulate_over_time", { duration: 0.0025, probes: ["CNT1.q0", "CNT1.q1"], samples: 1 })
	// Edges at 0, 1, 2 ms: a count of 3.
	expect(more.data).toMatchObject({ samples: [{ values: { "CNT1.q0": { voltage: 5 }, "CNT1.q1": { voltage: 5 } } }] })
})

describe("lessons and tutoring", () => {
	test("list_lessons shows the lessons and challenges in teaching order", async () => {
		const { data } = await call("list_lessons")
		expect(data).toHaveLength(10)
		expect(data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "light-an-led", title: "Light an LED safely", level: "beginner", kind: "lesson" }),
				expect.objectContaining({ id: "low-pass-filter", level: "advanced", kind: "challenge" }),
			]),
		)
	})

	test("load_lesson starts a fresh circuit and gives the goal, steps, checks and the hints for the tutor", async () => {
		await call("add_component", { type: "resistor" })
		const { data } = await call("load_lesson", { id: "voltage-divider" })
		expect(data).toMatchObject({
			title: "Make 2.5 V from 5 V",
			goal: expect.stringContaining("2.5 V"),
			steps: expect.arrayContaining(["Place a 5 V voltage source, two resistors and a ground."]),
			checks: expect.arrayContaining(["Some point sits at 2.4–2.6 V"]),
			hintsForTutor: expect.arrayContaining([expect.stringContaining("R2 ÷ (R1 + R2)")]),
		})
		expect((await call("get_circuit")).data).toMatchObject({ circuit: { name: "Make 2.5 V from 5 V", components: [] } })
	})

	test("check_solution reports each check on the current circuit", async () => {
		await call("load_lesson", { id: "voltage-divider" })
		const before = await call("check_solution")
		expect(before.data).toMatchObject({ lesson: "voltage-divider", passed: false })

		await call("add_component", { type: "voltage-source", params: { voltage: 5 } })
		await call("add_component", { type: "resistor", params: { resistance: 1000 } })
		await call("add_component", { type: "resistor", params: { resistance: 1000 } })
		await call("add_component", { type: "ground" })
		await call("connect", { from: "V1.positive", to: "R1.a" })
		await call("connect", { from: "R1.b", to: "R2.a" })
		await call("connect", { from: "R2.b", to: "GND1.terminal" })
		await call("connect", { from: "V1.negative", to: "GND1.terminal" })
		const after = await call("check_solution")
		expect(after.data).toMatchObject({
			passed: true,
			results: expect.arrayContaining([expect.objectContaining({ description: "Some point sits at 2.4–2.6 V", passed: true })]),
		})
	})

	test("check_solution without a lesson says how to start one", async () => {
		const result = await call("check_solution")
		expect(result.isError).toBe(true)
		expect(result.text).toContain("load_lesson")
	})

	test("an unknown lesson lists the real ones", async () => {
		const result = await call("load_lesson", { id: "quantum-computer" })
		expect(result.isError).toBe(true)
		expect(result.text).toContain("light-an-led")
	})

	test("the tutor prompt sets up coaching for a lesson", async () => {
		const prompt = await client.getPrompt({ name: "tutor", arguments: { lesson: "light-an-led" } })
		const [message] = prompt.messages
		const text = message?.content.type === "text" ? message.content.text : ""
		expect(text).toContain("Light an LED safely")
		expect(text).toContain("check_solution")
		expect(text).toMatch(/one hint at a time/i)
	})
})

test("rename_circuit renames the circuit", async () => {
	expect((await call("rename_circuit", { name: "Night light" })).text).toBe('Renamed the circuit "Night light"')
	expect((await call("get_circuit")).data).toMatchObject({ circuit: { name: "Night light" } })
})

test("the agent can leave a note on the canvas and take it away", async () => {
	expect((await call("add_note", { text: "This resistor limits the LED current", x: 120, y: -40 })).text).toBe(
		'Added note "This resistor limits the LED current"',
	)
	expect((await call("get_circuit")).data).toMatchObject({
		circuit: { notes: [{ id: "note1", position: { x: 120, y: -40 }, text: "This resistor limits the LED current" }] },
	})
	expect((await call("remove_note", { noteId: "note1" })).isError).toBe(false)
})

test("the lesson travels with the circuit, so a learner's saved attempt can be checked later", async () => {
	await call("load_lesson", { id: "light-an-led" })
	expect((await call("get_circuit")).data).toMatchObject({ circuit: { lesson: "light-an-led" } })
	const saved = (await call("get_circuit")).data as { circuit: unknown }
	await call("create_circuit", { name: "Something else" })
	expect((await call("check_solution")).isError).toBe(true)
	document.replace(saved.circuit as ReturnType<typeof createCircuit>, "learner", "Opened my attempt")
	expect((await call("check_solution")).data).toMatchObject({ lesson: "light-an-led", passed: false })
})

test("disconnect removes one wire, and remove_component removes a part with its wires", async () => {
	await buildVoltageDivider()
	const wiresOf = () => document.circuit.wires.map((wire) => `${wire.from.componentId}.${wire.from.pin}-${wire.to.componentId}.${wire.to.pin}`)
	expect(wiresOf()).toContain("R1.b-R2.a")

	const middle = document.circuit.wires.find((wire) => wire.from.componentId === "R1" && wire.to.componentId === "R2")
	expect((await call("disconnect", { wireId: middle?.id ?? "" })).isError).toBe(false)
	expect(wiresOf()).not.toContain("R1.b-R2.a")
	expect((await call("disconnect", { wireId: "w99" })).isError).toBe(true)

	expect((await call("remove_component", { componentId: "R2" })).isError).toBe(false)
	expect(document.circuit.components.map((component) => component.id)).toEqual(["V1", "R1", "GND1"])
	expect(document.circuit.wires.some((wire) => wire.from.componentId === "R2" || wire.to.componentId === "R2")).toBe(false)
	expect((await call("remove_component", { componentId: "R2" })).isError).toBe(true)
})
