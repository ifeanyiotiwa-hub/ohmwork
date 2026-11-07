import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio"
import { expect, test } from "@playwright/test"

const MCP_DIRECTORY = fileURLToPath(new URL("../../mcp", import.meta.url))

let agent: Client

async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
	const result = await agent.callTool({ name, arguments: args })
	const [first] = result.content
	const text = first?.type === "text" ? first.text : ""
	if (result.isError) throw new Error(`${name} failed: ${text}`)
	return text
}

test.beforeEach(async ({ baseURL }) => {
	agent = new Client({ name: "e2e-agent", version: "1.0.0" })
	await agent.connect(
		new StdioClientTransport({
			command: "pnpm",
			args: ["--silent", "--dir", MCP_DIRECTORY, "start"],
			env: { ...getDefaultEnvironment(), EC_APP_URL: baseURL ?? "" },
		}),
	)
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
