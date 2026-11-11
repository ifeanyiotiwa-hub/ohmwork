import { COMPONENT_CATEGORIES } from "@ohmwork/format"
import { type Page, expect, test } from "@playwright/test"
import { choosePart } from "./support/parts"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
	await page.getByRole("button", { name: "New" }).click()
})

for (const category of COMPONENT_CATEGORIES) {
	test(`every ${category.name} part can be placed from the palette, is drawn, and can be deleted`, async ({ page }) => {
		const canvas = page.getByRole("application", { name: "Circuit canvas" })
		for (const type of category.types) {
			await choosePart(page, type)
			await canvas.click({ position: { x: 300, y: 220 } })
			const part = page.locator("[data-part]")
			await expect(part, type).toHaveCount(1)
			// A symbol path can be a straight line (zero width, so not "visible" to Playwright): count them instead.
			await expect(part, type).toBeVisible()
			expect(await part.locator(".symbol").count(), type).toBeGreaterThan(0)
			await page.keyboard.press("Delete")
			await expect(part, type).toHaveCount(0)
		}
	})
}

// For a look at chosen parts side by side: PALETTE_SCREENSHOT=<folder> PALETTE_TYPES=a,b,c npx playwright test e2e/palette.spec.ts
const shots = process.env["PALETTE_SCREENSHOT"]
const types = (process.env["PALETTE_TYPES"] ?? "").split(",").filter(Boolean)
test("chosen parts drawn side by side (only with PALETTE_SCREENSHOT)", async ({ page }) => {
	test.skip(!shots || types.length === 0, "set PALETTE_SCREENSHOT and PALETTE_TYPES")
	const canvas = page.getByRole("application", { name: "Circuit canvas" })
	for (const [index, type] of types.entries()) {
		await choosePart(page, type)
		await canvas.click({ position: { x: 80 + (index % 5) * 150, y: 110 + Math.floor(index / 5) * 190 } })
		await page.keyboard.press("Escape")
	}
	await page.screenshot({ path: `${shots}/palette-chosen.png` })
})

test.describe("the parts panel beside the categories", () => {
	const panel = (page: Page) => page.locator("[data-parts-panel]")

	test("is hidden until a category is pointed at, and steps aside once a part is chosen", async ({ page }) => {
		await expect(panel(page)).toBeHidden()
		await page.locator('[data-category="Passive"]').hover()
		await expect(panel(page)).toBeVisible()
		await expect(page.locator('[data-palette="resistor"]')).toBeVisible()
		await page.locator('[data-palette="resistor"]').click()
		await expect(panel(page)).toBeHidden()
		// The category holding the part being placed is marked, as its tile is out of sight.
		await expect(page.locator('[data-category="Passive"]')).toHaveClass(/holds-active/)
	})

	test("hides by itself a while after the pointer leaves it", async ({ page }) => {
		await page.locator('[data-category="Sources"]').click()
		await expect(panel(page)).toBeVisible()
		await page.mouse.move(900, 600)
		await expect(panel(page)).toBeVisible()
		await expect(panel(page)).toBeHidden({ timeout: 6000 })
	})

	test("stays open when pinned, until unpinned", async ({ page }) => {
		await page.locator('[data-category="Sources"]').click()
		const pin = page.locator("[data-pin-parts]")
		await pin.click()
		await expect(pin).toHaveAttribute("aria-pressed", "true")
		await page.mouse.move(900, 600)
		await page.waitForTimeout(5000)
		await expect(panel(page)).toBeVisible()
		// Choosing a part leaves a pinned panel open too.
		await page.locator('[data-palette="voltage-source"]').click()
		await expect(panel(page)).toBeVisible()
		await pin.click()
		await expect(pin).toHaveAttribute("aria-pressed", "false")
		await page.mouse.move(900, 600)
		await expect(panel(page)).toBeHidden({ timeout: 6000 })
	})

	test("hides on Escape, with the focus back on its category", async ({ page }) => {
		const sources = page.locator('[data-category="Sources"]')
		await sources.focus()
		await page.keyboard.press("ArrowDown")
		await expect(panel(page)).toBeVisible()
		await page.keyboard.press("Tab")
		await expect(page.locator(".part-button").first()).toBeFocused()
		await page.keyboard.press("Escape")
		await expect(panel(page)).toBeHidden()
		await expect(page.locator('[data-category="Passive"]')).toBeFocused()
	})

	test("hides when the circuit is clicked", async ({ page }) => {
		await page.locator('[data-category="Sources"]').click()
		await expect(panel(page)).toBeVisible()
		await page.getByRole("application", { name: "Circuit canvas" }).click({ position: { x: 600, y: 500 } })
		await expect(panel(page)).toBeHidden()
	})
})

test.describe("the sidebar", () => {
	const rail = (page: Page) => page.locator(".rail")
	const width = async (page: Page) => (await rail(page).boundingBox())?.width ?? 0

	test("narrows to icons and back, and the parts still open from it", async ({ page }) => {
		const toggle = page.locator("[data-rail-toggle]")
		await expect(toggle).toHaveAccessibleName("Collapse the sidebar")
		await toggle.click()
		await expect(toggle).toHaveAccessibleName("Expand the sidebar")
		await expect.poll(() => width(page)).toBeLessThan(80)
		// Icons only, but every button keeps its name.
		await expect(page.getByRole("button", { name: "Library" })).toBeVisible()
		await expect(page.locator('[data-category="Passive"]')).toHaveAccessibleName("Passive")
		await page.locator('[data-category="Passive"]').hover()
		await expect(page.locator("[data-parts-panel]")).toBeVisible()
		await page.locator('[data-palette="resistor"]').click()
		await page.getByRole("application", { name: "Circuit canvas" }).click({ position: { x: 650, y: 560 } })
		// The circuit is new (beforeEach), so this is its first resistor.
		await expect(page.locator('[data-part="R1"]')).toBeVisible()

		await toggle.click()
		await expect.poll(() => width(page)).toBeGreaterThan(150)
	})

	test("is remembered after a reload, and Ctrl/⌘+B switches it", async ({ page }) => {
		await page.locator("[data-rail-toggle]").click()
		await expect.poll(() => width(page)).toBeLessThan(80)
		await page.reload()
		await expect.poll(() => width(page)).toBeLessThan(80)
		await page.keyboard.press("ControlOrMeta+b")
		await expect.poll(() => width(page)).toBeGreaterThan(150)
	})
})
