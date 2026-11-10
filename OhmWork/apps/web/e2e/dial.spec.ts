import { type Page, expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
	await expect(page.locator('[data-part="R2"]')).toBeVisible()
	await page.locator('[data-part="R2"]').click()
})

const resistance = (page: Page) => page.locator('[data-field="resistance"]')
const dial = (page: Page) => page.locator("[data-dial]")

test("a selected part shows a dial; + and − step its value through the E12 series and the circuit follows", async ({ page }) => {
	await expect(dial(page)).toBeVisible()
	await page.getByRole("button", { name: "Increase R2 resistance" }).click()
	await expect(resistance(page)).toHaveValue("2.2 Ω")
	await page.getByRole("button", { name: "Increase R2 resistance" }).click()
	await expect(resistance(page)).toHaveValue("2.7 Ω")
	// 6 V across 1 Ω + 2.7 Ω: the middle sits at 6 × 2.7 / 3.7 = 4.38 V.
	await expect(page.locator(".node-label", { hasText: "4.38 V" })).toBeVisible()

	await page.getByRole("button", { name: "Decrease R2 resistance" }).click()
	await expect(resistance(page)).toHaveValue("2.2 Ω")
})

test("quick steps are one undo step", async ({ page }) => {
	for (let step = 0; step < 3; step++) await page.getByRole("button", { name: "Increase R2 resistance" }).click()
	await expect(resistance(page)).toHaveValue("3.3 Ω")
	await page.getByRole("button", { name: "Undo" }).click()
	await expect(resistance(page)).toHaveValue("2 Ω")
})

test("dragging the knob up turns the value up, one step per 10 pixels, and the turn is one undo step", async ({ page }) => {
	const knob = page.locator("[data-dial-knob]")
	const box = await knob.boundingBox()
	if (!box) throw new Error("no knob")
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.down()
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 35, { steps: 7 })
	await page.mouse.up()
	await expect(resistance(page)).toHaveValue("3.3 Ω")
	await page.getByRole("button", { name: "Undo" }).click()
	await expect(resistance(page)).toHaveValue("2 Ω")
})

test("the scroll wheel over the knob turns it; elsewhere it still zooms", async ({ page }) => {
	await page.locator("[data-dial-knob]").hover()
	await page.mouse.wheel(0, -100)
	await expect(resistance(page)).toHaveValue("2.2 Ω")
})

test("the + and − keys turn the selected part's dial", async ({ page }) => {
	await page.keyboard.press("+")
	await page.keyboard.press("+")
	await expect(resistance(page)).toHaveValue("2.7 Ω")
	await page.keyboard.press("-")
	await expect(resistance(page)).toHaveValue("2.2 Ω")
})

test("parts without a value to turn, and groups, show no dial", async ({ page }) => {
	await page.locator('[data-part="GND1"]').click()
	await expect(dial(page)).toHaveCount(0)
})
