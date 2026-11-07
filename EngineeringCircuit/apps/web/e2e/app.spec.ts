import { expect, test } from "@playwright/test"
import { choosePart } from "./support/parts"

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
	await choosePart(page, "resistor")
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
		await choosePart(page, type)
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
	await choosePart(page, "voltmeter")
	await canvas.click({ position: { x: 800, y: 200 } })
	await page.locator('[data-pin="VM1:positive"]').click()
	await page.locator('[data-pin="R2:a"]').click()
	await page.locator('[data-pin="VM1:negative"]').click()
	await page.locator('[data-pin="R2:b"]').click()
	await expect(canvas.locator(".meter-reading", { hasText: "4 V" })).toBeVisible()

	await choosePart(page, "ohmmeter")
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
		await choosePart(page, type)
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

test("a capacitor charges over time, and Restart empties it again", async ({ page }) => {
	await page.getByRole("button", { name: "New" }).click()
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [type, x, y] of [
		["voltage-source", 200, 300],
		["resistor", 400, 200],
		["capacitor", 600, 300],
		["ground", 400, 450],
	] as const) {
		await choosePart(page, type)
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of [
		["V1:positive", "R1:a"],
		["R1:b", "C1:a"],
		["C1:b", "GND1:terminal"],
		["V1:negative", "GND1:terminal"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	await page.keyboard.press("Escape")
	// 1 kΩ × 1 µF = 1 ms; at this speed one time constant takes 5 real seconds.
	const speed = page.locator('[data-field="speed"]')
	await speed.fill("0.0002")
	await speed.press("Enter")
	await page.getByRole("button", { name: "Restart" }).click()
	await expect(page.locator("[data-sim-time]")).toContainText("t =")

	await page.locator('[data-part="C1"]').click()
	const voltage = async () => {
		const text = (await page.locator("[data-readings] dd").first().textContent()) ?? ""
		const [number = "NaN", unit = ""] = text.trim().split(" ")
		return Number(number) * (unit.startsWith("m") ? 1e-3 : unit.startsWith("µ") ? 1e-6 : 1)
	}
	await expect.poll(voltage).toBeGreaterThan(0.5)
	const early = await voltage()
	await expect.poll(voltage).toBeGreaterThan(early + 0.3)
	expect(await voltage()).toBeLessThan(5)

	await page.getByRole("button", { name: "Restart" }).click()
	await expect.poll(voltage).toBeLessThan(early)
})

test("a potentiometer's slider moves the wiper voltage; a two-way switch moves the current", async ({ page }) => {
	await page.getByRole("button", { name: "New" }).click()
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [type, x, y] of [
		["voltage-source", 150, 300],
		["potentiometer", 400, 300],
		["voltmeter", 650, 300],
		["ground", 400, 480],
	] as const) {
		await choosePart(page, type)
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of [
		["V1:positive", "POT1:a"],
		["POT1:b", "GND1:terminal"],
		["V1:negative", "GND1:terminal"],
		["POT1:wiper", "VM1:positive"],
		["VM1:negative", "GND1:terminal"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	const meter = canvas.locator(".meter-reading")
	await expect(meter).toHaveText("2.5 V")

	await page.locator('[data-part="POT1"]').click()
	await page.locator('[data-slider="position"]').fill("0.2")
	await expect(meter).toHaveText("4 V")

	await page.getByRole("button", { name: "New" }).click()
	for (const [type, x, y] of [
		["voltage-source", 150, 300],
		["switch-spdt", 400, 300],
		["resistor", 650, 200],
		["resistor", 650, 400],
		["ground", 400, 500],
	] as const) {
		await choosePart(page, type)
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of [
		["V1:positive", "SW1:common"],
		["SW1:a", "R1:a"],
		["SW1:b", "R2:a"],
		["R1:b", "GND1:terminal"],
		["R2:b", "GND1:terminal"],
		["V1:negative", "GND1:terminal"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	await page.keyboard.press("Escape")
	const r1 = canvas.locator(".part-reading").filter({ hasText: "5 mA" })
	await expect(r1).toHaveCount(2)
	await page.locator('[data-part="SW1"]').click()
	await expect(r1).toHaveCount(2)
	await page.locator('[data-part="R1"]').click()
	await expect(page.locator("[data-readings]")).toContainText("0 A")
})

test("a transistor switch: pressing the button lights the LED", async ({ page }) => {
	await page.getByRole("button", { name: "New" }).click()
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [type, x, y] of [
		["voltage-source", 120, 320],
		["resistor", 420, 140],
		["led", 620, 140],
		["npn-transistor", 640, 320],
		["push-button", 260, 320],
		["resistor", 440, 320],
		["ground", 640, 500],
	] as const) {
		await choosePart(page, type)
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of [
		["V1:positive", "R1:a"],
		["R1:b", "LED1:anode"],
		["LED1:cathode", "Q1:collector"],
		["Q1:emitter", "GND1:terminal"],
		["V1:negative", "GND1:terminal"],
		["V1:positive", "PB1:a"],
		["PB1:b", "R2:a"],
		["R2:b", "Q1:base"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	await page.keyboard.press("Escape")
	const glow = page.locator('[data-part="LED1"] .glow')
	const strength = async () => Number(await glow.getAttribute("opacity"))
	await expect.poll(strength).toBeLessThan(0.01)

	await page.locator('[data-part="PB1"]').hover()
	await page.mouse.down()
	// (5 V − about 1.8 V LED − 0.1 V saturated transistor) / 1 kΩ ≈ 3.2 mA: a third of full brightness (10 mA).
	await expect.poll(strength).toBeGreaterThan(0.28)
	expect(await strength()).toBeLessThan(0.36)
	await page.mouse.up()
	await expect.poll(strength).toBeLessThan(0.01)
})
