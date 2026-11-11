import { expect, test } from "@playwright/test"
import { choosePart } from "./support/parts"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
})

test("a learner completes 'Light an LED safely', guided by the checks", async ({ page }) => {
	await page.getByRole("button", { name: "Lessons" }).click()
	await page.locator('[data-lesson-entry="light-an-led"]').getByRole("button", { name: "Start" }).click()
	const card = page.locator('[data-lesson-id="light-an-led"]')
	await expect(card).toContainText("Light an LED from a 5 V source")

	await card.getByRole("button", { name: "Hint" }).first().click()
	await expect(card).toContainText("The LED only conducts one way")

	await card.locator("[data-lesson-check]").click()
	await expect(card.locator('[data-check-passed="false"]').first()).toBeVisible()
	await expect(card).toContainText("There is no LED in the circuit.")

	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [type, x, y] of [
		["voltage-source", 200, 300],
		["resistor", 400, 200],
		["led", 600, 300],
		["ground", 400, 450],
	] as const) {
		await choosePart(page, type)
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of [
		["V1:positive", "R1:a"],
		["R1:b", "LED1:anode"],
		["LED1:cathode", "GND1:terminal"],
		["V1:negative", "GND1:terminal"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	await page.keyboard.press("Escape")

	// The default 1 kΩ: at this low current the LED drops about 1.68 V, so (5 − 1.68) V / 1 kΩ ≈ 3.32 mA.
	// Too little, and the check says so with the real number.
	await card.locator("[data-lesson-check]").click()
	await expect(card).toContainText("LED1 carries 3.32 mA.")
	await expect(card.locator("[data-lesson-verdict]")).toHaveCount(0)

	await page.locator('[data-part="R1"]').click()
	const resistance = page.locator('[data-field="resistance"]')
	await resistance.fill("220")
	await resistance.press("Enter")
	// Click empty canvas to deselect the resistor and see the lesson card again.
	await canvas.click({ position: { x: 650, y: 120 } })
	await card.locator("[data-lesson-check]").click()
	await expect(card.locator("[data-lesson-verdict]")).toHaveText("All checks pass. Well done!")
})

test("a note can be added, written, seen on the canvas and deleted", async ({ page }) => {
	await page.locator("[data-add-note]").click()
	const text = page.locator("[data-note-text]")
	await text.fill("The 2 Ω resistor gets two thirds of the voltage")
	await text.blur()
	const note = page.locator('[data-note="note1"]')
	await expect(note).toContainText("two thirds")

	await note.click()
	await page.getByRole("button", { name: "Delete" }).click()
	await expect(note).toHaveCount(0)
})

test("a challenge has a goal and no steps; a learner's RC filter passes the low-pass challenge", async ({ page }) => {
	await page.getByRole("button", { name: "Lessons" }).click()
	const entry = page.locator('[data-lesson-entry="low-pass-filter"]')
	await expect(entry).toContainText("challenge, advanced")
	await entry.getByRole("button", { name: "Start" }).click()
	const card = page.locator('[data-lesson-id="low-pass-filter"]')
	await expect(card.locator("h3")).toHaveText("Challenge")
	await expect(card.locator("[data-challenge]")).toBeVisible()
	await expect(card.locator(".steps")).toHaveCount(0)

	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [type, x, y] of [
		["ac-source", 120, 280],
		["resistor", 300, 160],
		["capacitor", 460, 280],
		["ground", 300, 440],
		["scope-probe", 640, 280],
	] as const) {
		await choosePart(page, type)
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of [
		["AC1:positive", "R1:a"],
		["R1:b", "C1:a"],
		["C1:b", "GND1:terminal"],
		["AC1:negative", "GND1:terminal"],
		["C1:a", "P1:positive"],
		["P1:negative", "GND1:terminal"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	await page.keyboard.press("Escape")
	// 1 kΩ and 159 nF: a corner at 1 kHz.
	await page.locator('[data-part="C1"]').click()
	const capacitance = page.locator('[data-field="capacitance"]')
	await capacitance.fill("159n")
	await capacitance.press("Enter")
	// Escape in a text box is the box's own; clicking empty canvas deselects, bringing the lesson back.
	await canvas.click({ position: { x: 650, y: 120 } })

	await card.locator("[data-lesson-check]").click()
	await expect(card.locator("[data-lesson-verdict]")).toHaveText("All checks pass. Well done!")
})
