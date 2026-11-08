import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio"
import { expect, test } from "@playwright/test"
import { choosePart } from "./support/parts"

const MCP_DIRECTORY = fileURLToPath(new URL("../../mcp", import.meta.url))

let agent: Client
/** The agent restarts in a few seconds, more under load; the app retries 1, 2, 4, then every 8 s. */
const RECONNECT_WAIT_MS = 40_000
/** Two agent starts plus a reconnect: more than the default 30 s per test. */
const RESTART_TEST_MS = 90_000

async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
	const result = await agent.callTool({ name, arguments: args })
	const [first] = result.content
	const text = first?.type === "text" ? first.text : ""
	if (result.isError) throw new Error(`${name} failed: ${text}`)
	return text
}

async function startAgent(env: Record<string, string>): Promise<Client> {
	const client = new Client({ name: "e2e-agent", version: "1.0.0" })
	await client.connect(
		new StdioClientTransport({ command: "pnpm", args: ["--silent", "--dir", MCP_DIRECTORY, "start"], env: { ...getDefaultEnvironment(), ...env } }),
	)
	return client
}

test.beforeEach(async ({ baseURL }) => {
	agent = await startAgent({ EC_APP_URL: baseURL ?? "" })
})

test.afterEach(async () => {
	await agent.close()
})

test("the agent builds in the open app, and the learner's edits reach the agent", async ({ page }) => {
	const link = (await call("open_in_app")).split("\n").at(-1) ?? ""
	await page.goto(link)
	await expect(page.locator("[data-live]")).toContainText("Live with agent")

	await call("create_circuit", { name: "Built by the agent" })
	await call("add_component", { type: "voltage-source", params: { voltage: 9 }, x: 0, y: 100 })
	await call("add_component", { type: "resistor", params: { resistance: 900 }, x: 160, y: 0 })
	await call("add_component", { type: "ground", x: 160, y: 240 })
	await call("connect", { from: "V1.positive", to: "R1.a" })
	await call("connect", { from: "R1.b", to: "GND1.terminal" })
	await call("connect", { from: "V1.negative", to: "GND1.terminal" })

	await expect(page.locator('[data-part="R1"]')).toBeVisible()
	await expect(page.locator("[data-wire]")).toHaveCount(3)
	await expect(page.locator("[data-live]")).toContainText("Agent: Connected V1.negative to GND1.terminal")
	await expect(page.locator(".part-reading", { hasText: "10 mA" }).first()).toBeVisible()

	await page.locator('[data-part="R1"]').click()
	const resistance = page.locator('[data-field="resistance"]')
	await resistance.fill("450")
	await resistance.press("Enter")
	await expect(page.locator("[data-live]")).toContainText("You: Set R1 resistance to 450")

	expect(JSON.parse(await call("probe", { target: "R1" }))).toMatchObject({ current: 0.02 })
	expect(await call("recent_changes")).toContain('"author": "learner"')
})

test("undo in the app undoes the agent's last change", async ({ page }) => {
	await page.goto((await call("open_in_app")).split("\n").at(-1) ?? "")
	await expect(page.locator("[data-live]")).toContainText("Live with agent")

	await call("create_circuit", { name: "Undo test" })
	await call("add_component", { type: "resistor" })
	await expect(page.locator('[data-part="R1"]')).toBeVisible()

	await page.getByRole("button", { name: "Undo" }).click()
	await expect(page.locator('[data-part="R1"]')).toHaveCount(0)
	expect(await call("get_circuit")).not.toContain('"R1"')
})

test("after the agent restarts, the app reconnects and the new agent gets the learner's circuit", async ({ page, baseURL }) => {
	test.setTimeout(RESTART_TEST_MS)
	await agent.close()
	// A fixed port and token, so the restarted server is at the same link.
	const env = { EC_APP_URL: baseURL ?? "", EC_LIVE_PORT: "4391", EC_LIVE_TOKEN: "e2e-reconnect-token-0123456789" }
	agent = await startAgent(env)
	await page.goto((await call("open_in_app")).split("\n").at(-1) ?? "")
	const status = page.locator("[data-live]")
	await expect(status).toContainText("Live with agent")

	await choosePart(page, "resistor")
	await page.getByRole("application", { name: "Circuit canvas" }).click({ position: { x: 400, y: 300 } })
	await expect.poll(async () => call("get_circuit")).toContain('"R1"')

	await agent.close()
	await expect(status).toContainText("Reconnecting")
	agent = await startAgent(env)
	await expect(status).toContainText("Live with agent", { timeout: RECONNECT_WAIT_MS })
	await expect.poll(async () => call("get_circuit")).toContain('"R1"')
	await expect(page.locator('[data-part="R1"]')).toBeVisible()
})

test("work from a live session survives a reload after the agent has gone, and reaches the agent when it is back", async ({ page, baseURL }) => {
	test.setTimeout(RESTART_TEST_MS)
	await agent.close()
	const env = { EC_APP_URL: baseURL ?? "", EC_LIVE_PORT: "4392", EC_LIVE_TOKEN: "e2e-reload-token-0123456789ab" }
	agent = await startAgent(env)
	const link = (await call("open_in_app")).split("\n").at(-1) ?? ""
	await page.goto(link)
	const status = page.locator("[data-live]")
	await expect(status).toContainText("Live with agent")

	await choosePart(page, "capacitor")
	await page.getByRole("application", { name: "Circuit canvas" }).click({ position: { x: 400, y: 300 } })
	await expect.poll(async () => call("get_circuit")).toContain('"C1"')
	await agent.close()
	await expect(status).toContainText("Reconnecting")
	await page.waitForTimeout(800)

	await page.reload()
	await expect(page.locator('[data-part="C1"]')).toBeVisible()

	agent = await startAgent(env)
	await expect(status).toContainText("Live with agent", { timeout: RECONNECT_WAIT_MS })
	await expect.poll(async () => call("get_circuit")).toContain('"C1"')
})
