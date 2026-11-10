import { COMPONENT_CATEGORIES } from "@ohmwork/format"
import { expect, test } from "@playwright/test"
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
