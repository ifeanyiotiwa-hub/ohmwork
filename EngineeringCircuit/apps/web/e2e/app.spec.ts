import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
})

test("the example circuit is solved on load: 6 V, 4 V and 2 A", async ({ page }) => {
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	await expect(canvas.locator(".node-label", { hasText: "6 V" })).toBeVisible()
	await expect(canvas.locator(".node-label", { hasText: "4 V" })).toBeVisible()
	await expect(canvas.locator(".part-reading", { hasText: "2 A" }).first()).toBeVisible()
	await expect(page.getByRole("status")).toContainText("Simulating")
})

test("editing a value re-solves: R2 = 4 Ω gets 4.8 V", async ({ page }) => {
	await page.locator('[data-part="R2"]').click()
	const resistance = page.locator('[data-field="resistance"]')
	await resistance.fill("4")
	await resistance.press("Enter")

	await expect(page.locator("[data-readings]")).toContainText("4.8 V")
	await expect(page.locator(".node-label", { hasText: "4.8 V" })).toBeVisible()
})

test("placing a part from the palette, then undo", async ({ page }) => {
	await page.locator('[data-palette="resistor"]').click()
	await page.getByRole("application", { name: "Circuit canvas" }).click({ position: { x: 700, y: 500 } })

	await expect(page.locator('[data-part="R3"]')).toBeVisible()
	await expect(page.locator('[data-field="resistance"]')).toHaveValue("1 kΩ")

	await page.getByRole("button", { name: "Undo" }).click()
	await expect(page.locator('[data-part="R3"]')).toHaveCount(0)
})

test("wiring a battery to itself is reported as a short circuit", async ({ page }) => {
	await page.locator('[data-pin="V1:positive"]').click()
	await page.locator('[data-pin="V1:negative"]').click()

	await expect(page.getByRole("status")).toContainText("Short circuit")
})

test("deleting a part removes it and its wires", async ({ page }) => {
	await page.locator('[data-part="R1"]').click()
	await page.keyboard.press("Delete")

	await expect(page.locator('[data-part="R1"]')).toHaveCount(0)
	await expect(page.locator("[data-wire]")).toHaveCount(2)
})

test("a switch flips when clicked and stops the current", async ({ page }) => {
	await page.getByRole("button", { name: "New" }).click()
	for (const [type, x, y] of [
		["voltage-source", 200, 300],
		["switch", 400, 200],
		["resistor", 600, 300],
		["ground", 400, 450],
	] as const) {
		await page.locator(`[data-palette="${type}"]`).click()
		await page.getByRole("application", { name: "Circuit canvas" }).click({ position: { x, y } })
	}
	for (const [from, to] of [
		["V1:positive", "S1:a"],
		["S1:b", "R1:a"],
		["R1:b", "GND1:terminal"],
		["V1:negative", "GND1:terminal"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}

	await page.locator('[data-part="R1"]').click()
	await expect(page.locator("[data-readings]")).toContainText("5 mA")

	await page.locator('[data-part="S1"]').click()
	await page.locator('[data-part="R1"]').click()
	await expect(page.locator("[data-readings]")).toContainText("0 A")
})

test("a voltmeter across R2 shows 4 V; an ohmmeter touching nothing reads open", async ({ page }) => {
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	await page.locator('[data-palette="voltmeter"]').click()
	await canvas.click({ position: { x: 800, y: 200 } })
	await page.locator('[data-pin="VM1:positive"]').click()
	await page.locator('[data-pin="R2:a"]').click()
	await page.locator('[data-pin="VM1:negative"]').click()
	await page.locator('[data-pin="R2:b"]').click()
	await expect(canvas.locator(".meter-reading", { hasText: "4 V" })).toBeVisible()

	await page.locator('[data-palette="ohmmeter"]').click()
	await canvas.click({ position: { x: 800, y: 500 } })
	await expect(canvas.locator(".meter-reading", { hasText: "OL (open)" })).toBeVisible()
})

test("a push button conducts only while held down", async ({ page }) => {
	await page.getByRole("button", { name: "New" }).click()
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [type, x, y] of [
		["voltage-source", 200, 300],
		["push-button", 400, 200],
		["resistor", 600, 300],
		["ground", 400, 450],
	] as const) {
		await page.locator(`[data-palette="${type}"]`).click()
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of [
		["V1:positive", "PB1:a"],
		["PB1:b", "R1:a"],
		["R1:b", "GND1:terminal"],
		["V1:negative", "GND1:terminal"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	const current = canvas.locator(".part-reading", { hasText: "5 mA" })
	await expect(current).toHaveCount(0)

	await page.locator('[data-part="PB1"]').hover()
	await page.mouse.down()
	await expect(current.first()).toBeVisible()
	await page.mouse.up()
	await expect(current).toHaveCount(0)
})
