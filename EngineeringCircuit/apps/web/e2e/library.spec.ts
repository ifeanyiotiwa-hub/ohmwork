import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
	await page.goto("/")
})

const library = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Your circuits" })

test("save to the library, start afresh, then open it again", async ({ page }) => {
	await page.getByRole("button", { name: "Library" }).click()
	await library(page).locator("[data-library-name]").fill("My divider")
	await library(page).locator("[data-library-save]").click()
	await expect(library(page).locator("[data-library-message]")).toHaveText('Saved "My divider".')
	await expect(library(page).locator('[data-library-entry="My divider"]')).toBeVisible()
	await library(page).getByRole("button", { name: "Close" }).click()

	await page.getByRole("button", { name: "New" }).click()
	await expect(page.locator('[data-part="R2"]')).toHaveCount(0)

	await page.getByRole("button", { name: "Library" }).click()
	await library(page).locator('[data-library-entry="My divider"]').getByRole("button", { name: "Open" }).click()
	await expect(library(page)).toBeHidden()
	await expect(page.locator('[data-part="R2"]')).toBeVisible()
	await expect(page.getByRole("heading", { name: "My divider" })).toBeVisible()
})

test("the circuit being edited survives a reload", async ({ page }) => {
	await page.locator('[data-part="R2"]').click()
	const resistance = page.locator('[data-field="resistance"]')
	await resistance.fill("4")
	await resistance.press("Enter")
	await expect(page.locator(".node-label", { hasText: "4.8 V" })).toBeVisible()

	await page.waitForTimeout(800)
	await page.reload()
	await expect(page.locator(".node-label", { hasText: "4.8 V" })).toBeVisible()
})

test("download a circuit file and open it again", async ({ page }, testInfo) => {
	await page.getByRole("button", { name: "Library" }).click()
	const downloading = page.waitForEvent("download")
	await library(page).locator("[data-library-download]").click()
	const download = await downloading
	expect(download.suggestedFilename()).toBe("kvl-and-voltage-divider.circuit.json")
	const path = testInfo.outputPath(download.suggestedFilename())
	await download.saveAs(path)
	await library(page).getByRole("button", { name: "Close" }).click()

	await page.getByRole("button", { name: "New" }).click()
	await page.getByRole("button", { name: "Library" }).click()
	await library(page).locator("[data-library-file]").setInputFiles(path)
	await expect(page.locator('[data-part="R2"]')).toBeVisible()
	await expect(page.locator(".node-label", { hasText: "4 V" })).toBeVisible()
})

test("a file that is not a circuit is explained, not opened", async ({ page }) => {
	await page.getByRole("button", { name: "Library" }).click()
	await library(page)
		.locator("[data-library-file]")
		.setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"shopping": ["milk"]}') })
	await expect(library(page).locator("[data-library-message]")).toContainText('Couldn\'t open "notes.json"')
	await expect(page.locator('[data-part="R2"]')).toBeVisible()
})
