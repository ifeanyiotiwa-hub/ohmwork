import { type Page, expect, test } from "@playwright/test"
import { choosePart } from "./support/parts"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
	await page.getByRole("button", { name: "New" }).click()
})

async function build(page: Page, parts: readonly (readonly [string, number, number])[], wires: readonly (readonly [string, string])[]) {
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [type, x, y] of parts) {
		await choosePart(page, type)
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of wires) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	await page.keyboard.press("Escape")
}

test("a part over its rating shows on the canvas: it glows and smokes", async ({ page }) => {
	await build(
		page,
		[["voltage-source", 200, 300], ["led", 500, 300], ["ground", 350, 450]],
		[["V1:positive", "LED1:anode"], ["LED1:cathode", "GND1:terminal"], ["V1:negative", "GND1:terminal"]],
	)
	await expect(page.locator('[data-part="LED1"]')).toHaveClass(/overheated/)
	await expect(page.locator('[data-part="LED1"] [data-smoke]')).toHaveCount(1)
	await expect(page.locator('[data-part="V1"]')).not.toHaveClass(/overheated/)
})

test("a charging capacitor's plates take on the colours of their voltages, like the wires", async ({ page }) => {
	await build(
		page,
		[["voltage-source", 150, 300], ["resistor", 350, 200], ["capacitor", 550, 300], ["ground", 350, 450]],
		[["V1:positive", "R1:a"], ["R1:b", "C1:a"], ["C1:b", "GND1:terminal"], ["V1:negative", "GND1:terminal"]],
	)
	const plate = page.locator('[data-part="C1"] [data-plate="a"]')
	const supply = page.locator('[data-wire="w1"] .wire-line')
	await expect.poll(async () => plate.evaluate((element) => getComputedStyle(element).stroke), { timeout: 15_000 }).toBe(
		await supply.evaluate((element) => getComputedStyle(element).stroke),
	)
})

test("dragging a potentiometer's wiper moves it along the track, and Undo puts it back", async ({ page }) => {
	await build(page, [["potentiometer", 400, 300]], [])
	// Select it by its track (the bottom of its box): the middle of the box is the wiper's handle.
	const part = await page.locator('[data-part="POT1"]').boundingBox()
	if (!part) throw new Error("no potentiometer")
	await page.mouse.click(part.x + part.width / 2, part.y + part.height - 6)
	const position = page.locator('[data-field="position"]')
	await expect(position).toHaveValue("0.5")
	const wiper = await page.locator('[data-part="POT1"] [data-wiper]').boundingBox()
	if (!wiper) throw new Error("no wiper")
	await page.mouse.move(wiper.x + wiper.width / 2, wiper.y + wiper.height / 2)
	await page.mouse.down()
	await page.mouse.move(wiper.x + wiper.width / 2 + 40, wiper.y + wiper.height / 2, { steps: 6 })
	await page.mouse.up()
	await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0.6)
	await page.getByRole("button", { name: "Undo" }).click()
	await expect(position).toHaveValue("0.5")
})

test("a motor spins up and shows its speed; a reversed supply turns it backwards", async ({ page }) => {
	test.setTimeout(60_000)
	await build(
		page,
		[["voltage-source", 200, 300], ["dc-motor", 500, 300], ["ground", 350, 450]],
		[["V1:positive", "MOT1:a"], ["MOT1:b", "GND1:terminal"], ["V1:negative", "GND1:terminal"]],
	)
	// 5 V on the FAULHABER 2224U012SR: 5 / (Ke + R·b/Kt) = 339 rad/s, 3238 rpm, after its ~11 ms spin-up.
	const motor = page.locator('[data-part="MOT1"]')
	await expect(page.locator(".part-reading", { hasText: "3238 rpm" })).toBeVisible({ timeout: 30_000 })
	await expect(motor.locator("[data-rotor]")).toHaveClass(/spinning/)
	await expect(motor.locator("[data-rotor]")).not.toHaveClass(/reverse/)
	await motor.click()
	await expect(page.locator("[data-speed]")).toHaveText("3238 rpm")

	await page.locator('[data-part="V1"]').click()
	const voltage = page.locator('[data-field="voltage"]')
	await voltage.fill("-5")
	await voltage.press("Enter")
	await expect(page.locator(".part-reading", { hasText: "−3238 rpm" })).toBeVisible({ timeout: 30_000 })
	await expect(motor.locator("[data-rotor]")).toHaveClass(/reverse/)
})
