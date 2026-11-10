import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
	await expect(page.locator('[data-part="R2"]')).toBeVisible()
})

const readout = (page: import("@playwright/test").Page) => page.locator("[data-readout]")

test("hovering a wire shows its live voltage and current; moving off hides it", async ({ page }) => {
	// w1 is L-shaped (up from the battery, then along the top): point at its top run, not the empty middle of its box.
	const box = await page.locator('[data-wire="w1"] .wire-line').boundingBox()
	if (!box) throw new Error("no wire")
	await page.mouse.move(box.x + box.width / 2, box.y + 1)
	await expect(readout(page)).toContainText("6 V")
	await expect(readout(page)).toContainText("2 A")
	await page.mouse.move(5, 5)
	await expect(readout(page)).toHaveCount(0)
})

test("hovering a pin shows which pin it is and its voltage", async ({ page }) => {
	await page.locator('[data-pin="R2:a"]').hover()
	await expect(readout(page)).toHaveText("R2 a · 4 V")
})

test.describe("on a touch screen", () => {
	test.use({ hasTouch: true })

	test("tapping a wire shows its readout; tapping the background hides it", async ({ page }) => {
		const session = await page.context().newCDPSession(page)
		const tap = async (x: number, y: number) => {
			await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
			await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
		}
		const wire = await page.locator('[data-wire="w1"] .wire-line').boundingBox()
		if (!wire) throw new Error("no wire")
		await tap(wire.x + wire.width / 2, wire.y + 1)
		await expect(readout(page)).toContainText("2 A")
		const canvas = await page.locator("svg.canvas").boundingBox()
		if (!canvas) throw new Error("no canvas")
		// Empty background at the left edge, below the undo and pause controls in the top-left corner.
		await tap(canvas.x + 20, canvas.y + 100)
		await expect(readout(page)).toHaveCount(0)
	})
})
