import { type Page, expect, test } from "@playwright/test"
import { choosePart } from "./support/parts"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
	await expect(page.locator('[data-part="R1"]')).toBeVisible()
})

/** UI_CONFIG.gridSize: parts snap to it. */
const GRID = 20
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" })
const rotationOf = (page: Page, id: string) => page.locator(`[data-part="${id}"] [transform^="rotate"]`).first().getAttribute("transform")
const placeOf = (page: Page, selector: string) => page.locator(selector).first().getAttribute("transform")

test("the Rotate button and the R key turn the selected part a quarter turn each", async ({ page }) => {
	await page.locator('[data-part="R1"]').click()
	const start = await rotationOf(page, "R1")
	await inspector(page).getByRole("button", { name: "Rotate" }).click()
	await expect.poll(() => rotationOf(page, "R1")).not.toBe(start)
	const once = await rotationOf(page, "R1")
	await page.keyboard.press("r")
	await expect.poll(() => rotationOf(page, "R1")).not.toBe(once)
})

test("Pause stops simulated time and says so; Resume goes on", async ({ page }) => {
	await page.getByRole("button", { name: "New" }).click()
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [type, x, y] of [
		["ac-source", 200, 300],
		["resistor", 500, 300],
		["ground", 350, 450],
	] as const) {
		await choosePart(page, type)
		await canvas.click({ position: { x, y } })
	}
	for (const [from, to] of [
		["AC1:positive", "R1:a"],
		["R1:b", "GND1:terminal"],
		["AC1:negative", "GND1:terminal"],
	]) {
		await page.locator(`[data-pin="${from}"]`).click()
		await page.locator(`[data-pin="${to}"]`).click()
	}
	const time = page.locator("[data-sim-time]")
	await expect(time).toContainText("t =")

	await page.getByRole("button", { name: "Pause" }).click()
	await expect(time).toContainText("Paused")
	const frozen = await time.textContent()
	await page.waitForTimeout(500)
	expect(await time.textContent()).toBe(frozen)

	await page.getByRole("button", { name: "Resume" }).click()
	await expect(time).not.toHaveText(frozen ?? "")
	await expect(time).toContainText("Simulating")
})

test("Ctrl/⌘+A selects every part, Escape clears; the group panel copies, pastes and clears", async ({ page }) => {
	await page.locator("svg.canvas").click({ position: { x: 20, y: 20 } })
	await page.keyboard.press("ControlOrMeta+a")
	await expect(page.locator("[data-group-count]")).toHaveText("4 parts selected")
	await page.keyboard.press("Escape")
	await expect(page.locator("[data-group-count]")).toHaveCount(0)

	await page.keyboard.press("ControlOrMeta+a")
	await inspector(page).getByRole("button", { name: "Copy" }).click()
	await inspector(page).getByRole("button", { name: "Paste" }).click()
	await expect(page.locator("[data-part]")).toHaveCount(8)
	await expect(page.locator("[data-group-count]")).toHaveText("4 parts selected")
	await inspector(page).getByRole("button", { name: "Clear" }).click()
	await expect(page.locator("[data-group-count]")).toHaveCount(0)
})

test("dragging a part moves it (snapped to the grid), and Undo puts it back", async ({ page }) => {
	const before = await placeOf(page, '[data-part="R2"]')
	const box = await page.locator('[data-part="R2"]').boundingBox()
	if (!box) throw new Error("R2 not on screen")
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.down()
	await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 5 })
	await page.mouse.up()
	await expect.poll(() => placeOf(page, '[data-part="R2"]')).not.toBe(before)
	const after = await placeOf(page, '[data-part="R2"]')
	const [x = Number.NaN, y = Number.NaN] = (/translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(after ?? "") ?? []).slice(1).map(Number)
	expect([x % GRID, y % GRID]).toEqual([0, 0])
	await page.getByRole("button", { name: "Undo" }).click()
	await expect.poll(() => placeOf(page, '[data-part="R2"]')).toBe(before)
})

test("dragging a note moves it", async ({ page }) => {
	await page.locator("[data-add-note]").click()
	const note = page.locator("[data-note]").first()
	const before = await note.getAttribute("transform")
	const box = await note.boundingBox()
	if (!box) throw new Error("note not on screen")
	await page.mouse.move(box.x + 10, box.y + 10)
	await page.mouse.down()
	await page.mouse.move(box.x + 110, box.y + 60, { steps: 5 })
	await page.mouse.up()
	await expect(note).not.toHaveAttribute("transform", before ?? "")
})

test("a circuit deleted from the library is gone from the list", async ({ page }) => {
	await page.getByRole("button", { name: "Library" }).click()
	const library = page.getByRole("dialog", { name: "Your circuits" })
	await library.locator("[data-library-name]").fill("To delete")
	await library.locator("[data-library-save]").click()
	await expect(library.locator('[data-library-entry="To delete"]')).toBeVisible()
	await library.getByRole("button", { name: "Delete To delete" }).click()
	await expect(library.locator('[data-library-entry="To delete"]')).toHaveCount(0)
})
