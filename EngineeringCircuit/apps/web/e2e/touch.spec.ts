import { type CDPSession, type Page, expect, test } from "@playwright/test"

test.use({ hasTouch: true })

test.beforeEach(async ({ page }) => {
	await page.goto("/")
	await expect(page.locator('[data-part="R2"]')).toBeVisible()
})

type Finger = { x: number; y: number }

/** Real touch input through Chrome's DevTools protocol, so the page gets touch pointers as on a phone. */
async function touch(page: Page): Promise<(type: "touchStart" | "touchMove" | "touchEnd", fingers: Finger[]) => Promise<void>> {
	const session: CDPSession = await page.context().newCDPSession(page)
	return async (type, fingers) => {
		await session.send("Input.dispatchTouchEvent", { type, touchPoints: fingers.map((finger, id) => ({ ...finger, id })) })
	}
}

async function centreOf(page: Page, selector: string): Promise<Finger> {
	const box = await page.locator(selector).boundingBox()
	if (!box) throw new Error(`${selector} is not on screen`)
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const viewWidth = async (page: Page) => Number((await page.locator("svg.canvas").getAttribute("viewBox"))?.split(" ")[2])

test("pressing and holding parts selects them together, and the inspector deletes the group", async ({ page }) => {
	const send = await touch(page)
	for (const part of ['[data-part="R1"]', '[data-part="R2"]']) {
		const at = await centreOf(page, part)
		await send("touchStart", [at])
		await page.waitForTimeout(700)
		await send("touchEnd", [])
	}
	await expect(page.locator("[data-group-count]")).toHaveText("2 parts selected")

	await page.getByRole("complementary", { name: "Inspector" }).getByRole("button", { name: "Delete" }).click()
	await expect(page.locator('[data-part="R1"]')).toHaveCount(0)
	await expect(page.locator('[data-part="R2"]')).toHaveCount(0)
	await expect(page.locator('[data-part="V1"]')).toBeVisible()
})

test("a quick tap still selects one part, as a click does", async ({ page }) => {
	const send = await touch(page)
	const at = await centreOf(page, '[data-part="R1"]')
	await send("touchStart", [at])
	await send("touchEnd", [])
	await expect(page.getByRole("complementary", { name: "Inspector" }).getByRole("heading", { name: "R1" })).toBeVisible()
	await expect(page.locator("[data-group-count]")).toHaveCount(0)
})

test("spreading two fingers zooms in; pinching them together zooms out", async ({ page }) => {
	const send = await touch(page)
	const box = await page.locator("svg.canvas").boundingBox()
	if (!box) throw new Error("no canvas")
	const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
	const pair = (gap: number): Finger[] => [
		{ x: middle.x - gap, y: middle.y },
		{ x: middle.x + gap, y: middle.y },
	]
	const before = await viewWidth(page)

	await send("touchStart", pair(50))
	await send("touchMove", pair(75))
	await send("touchMove", pair(100))
	await send("touchEnd", [])
	await expect.poll(() => viewWidth(page)).toBeCloseTo(before / 2, 0)

	await send("touchStart", pair(100))
	await send("touchMove", pair(50))
	await send("touchEnd", [])
	await expect.poll(() => viewWidth(page)).toBeCloseTo(before, 0)
})

test("pressing and holding the background, then dragging, draws a selection box", async ({ page }) => {
	const send = await touch(page)
	const r1 = await centreOf(page, '[data-part="R1"]')
	const r2 = await centreOf(page, '[data-part="R2"]')
	const start = { x: Math.min(r1.x, r2.x) - 60, y: Math.min(r1.y, r2.y) - 40 }
	await send("touchStart", [start])
	await page.waitForTimeout(700)
	await send("touchMove", [{ x: Math.max(r1.x, r2.x) + 40, y: Math.max(r1.y, r2.y) + 40 }])
	await send("touchEnd", [])
	await expect(page.locator("[data-group-count]")).toHaveText("2 parts selected")
})
