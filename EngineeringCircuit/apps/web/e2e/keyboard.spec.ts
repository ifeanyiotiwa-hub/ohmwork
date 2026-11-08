import { type Page, expect, test } from "@playwright/test"
import { choosePart } from "./support/parts"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
	await expect(page.locator('[data-part="R1"]')).toBeVisible()
})

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" })
const placeOf = (page: Page, id: string) => page.locator(`[data-part="${id}"]`).getAttribute("transform")

test("Tab reaches the parts; Enter selects one, arrows move it a grid step, Delete removes it", async ({ page }) => {
	await page.locator('[data-part="V1"]').focus()
	await page.keyboard.press("Tab")
	await expect(page.locator('[data-part="R1"]')).toBeFocused()
	await page.keyboard.press("Enter")
	await expect(inspector(page).getByRole("heading", { name: "R1" })).toBeVisible()

	const before = await placeOf(page, "R1")
	await page.keyboard.press("ArrowRight")
	await expect.poll(() => placeOf(page, "R1")).not.toBe(before)
	const [x0 = 0] = (/translate\((-?[\d.]+)/.exec(before ?? "") ?? []).slice(1).map(Number)
	const [x1 = 0] = (/translate\((-?[\d.]+)/.exec((await placeOf(page, "R1")) ?? "") ?? []).slice(1).map(Number)
	expect(x1 - x0).toBe(20)

	await page.keyboard.press("Delete")
	await expect(page.locator('[data-part="R1"]')).toHaveCount(0)
})

test("Space flips a focused switch, as a click does", async ({ page }) => {
	await choosePart(page, "switch")
	await page.getByRole("application", { name: "Circuit canvas" }).click({ position: { x: 600, y: 420 } })
	const lever = page.locator('[data-part="S1"] .symbol').last()
	const open = await lever.getAttribute("d")
	await page.locator('[data-part="S1"]').focus()
	await page.keyboard.press("Space")
	await expect(lever).not.toHaveAttribute("d", open ?? "")
})

test("wires and notes can be reached and selected from the keyboard", async ({ page }) => {
	const wire = page.locator("[data-wire]").first()
	await wire.focus()
	await page.keyboard.press("Enter")
	await expect(inspector(page).getByText("Wire", { exact: true })).toBeVisible()

	await page.keyboard.press("Escape")
	await page.locator("[data-add-note]").click()
	await page.locator("svg.canvas").click({ position: { x: 20, y: 20 } })
	await page.locator("[data-note]").first().focus()
	await page.keyboard.press("Enter")
	await expect(inspector(page).getByText("Note", { exact: true })).toBeVisible()
})

test("the status bar announces problems, not the simulated time ticking", async ({ page }) => {
	await expect(page.locator('[aria-live] [data-sim-time], [data-sim-time][aria-live]')).toHaveCount(0)
	await page.locator('[data-pin="V1:positive"]').click()
	await page.locator('[data-pin="V1:negative"]').click()
	await expect(page.getByRole("status")).toContainText("Short circuit")
	await expect(page.getByRole("status")).not.toContainText("Simulating")
})
