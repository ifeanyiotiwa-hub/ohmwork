import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CircuitDocument } from "@engineering-circuit/editing"
import { createCircuit } from "@engineering-circuit/format"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { LiveServer } from "../src/live/live-server"
import { DEFAULT_OPTIONS } from "../src/options"
import { type ServerContext, createServer } from "../src/server"

type ToolOutput = { isError: boolean; text: string; data: unknown }

let client: Client
let document: CircuitDocument

async function start(context: ServerContext): Promise<void> {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	await createServer({ ...DEFAULT_OPTIONS, workspaceDirectory: process.cwd() }, context).connect(serverTransport)
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
		"connect",
		"create_circuit",
		"disconnect",
		"explain_circuit",
		"get_circuit",
		"list_component_types",
		"move_component",
		"open_circuit",
		"open_in_app",
		"probe",
		"recent_changes",
		"remove_component",
		"rotate_component",
		"save_circuit",
		"set_parameter",
		"simulate",
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
					properties: { resistance: expect.objectContaining({ description: "ohms" }) },
				}),
			}),
			expect.objectContaining({ type: "diode", simulated: false }),
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
				{ id: "R1", type: "resistor", params: { resistance: { value: 1000, unit: "ohms" } } },
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
	})

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true })
	})

	test("save then open restores the circuit", async () => {
		await buildVoltageDivider()
		const path = join(directory, "divider.json")

		expect((await call("save_circuit", { path })).isError).toBe(false)
		await call("create_circuit", { name: "Blank" })
		expect((await call("open_circuit", { path })).isError).toBe(false)

		expect((await call("probe", { target: "R1.b" })).data).toMatchObject({ voltage: 5 })
	})

	test("opening an invalid file reports why", async () => {
		const result = await call("open_circuit", { path: join(directory, "missing.json") })
		expect(result.isError).toBe(true)
		expect(result.text).toContain("Could not read")
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
