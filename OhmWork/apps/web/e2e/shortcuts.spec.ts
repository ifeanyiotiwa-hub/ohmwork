import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
	await expect(page.locator('[data-part="R1"]')).toBeVisible()
})

/** The rotation drawn on the part's symbol. */
const rotationOf = (page: import("@playwright/test").Page, id: string) =>
	page.locator(`[data-part="${id}"] [transform^="rotate"]`).first().getAttribute("transform")

/** Sends a key the way the browser would, without the browser acting on it (no real reload for Ctrl/⌘+R). */
const press = (page: import("@playwright/test").Page, key: string, modifiers: { ctrlKey?: boolean } = {}) =>
	page.evaluate(
		([pressed, ctrlKey]) => {
			const event = new KeyboardEvent("keydown", { key: pressed, ctrlKey, bubbles: true, cancelable: true })
			document.activeElement?.dispatchEvent(event) ?? document.dispatchEvent(event)
			return event.defaultPrevented
		},
		[key, modifiers.ctrlKey ?? false] as const,
	)

test("with a dialog open, Delete and R don't change the circuit behind it", async ({ page }) => {
	await page.locator('[data-part="R1"]').click()
	const before = await rotationOf(page, "R1")
	await page.getByRole("button", { name: "Library" }).click()
	await press(page, "Delete")
	await press(page, "r")
	await page.getByRole("dialog", { name: "Your circuits" }).getByRole("button", { name: "Close" }).click()
	await expect(page.locator('[data-part="R1"]')).toBeVisible()
	expect(await rotationOf(page, "R1")).toBe(before)
})

test("Ctrl/⌘+R is left to the browser: it does not rotate the selected part", async ({ page }) => {
	await page.locator('[data-part="R1"]').click()
	const before = await rotationOf(page, "R1")
	expect(await press(page, "r", { ctrlKey: true })).toBe(false)
	expect(await rotationOf(page, "R1")).toBe(before)
})

test("Ctrl/⌘+C copies selected text as usual, instead of copying parts", async ({ page }) => {
	await page.evaluate(() => {
		const description = document.querySelector(".description")
		if (!description) throw new Error("no description")
		getSelection()?.selectAllChildren(description)
	})
	expect(await press(page, "c", { ctrlKey: true })).toBe(false)
})
