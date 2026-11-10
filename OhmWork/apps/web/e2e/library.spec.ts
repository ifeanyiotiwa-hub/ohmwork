import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { fakeFileDialogs, savedFiles, withoutFileDialogs } from "./support/file-dialogs"

// Most tests act as Firefox or Safari (downloads and a file input); the file-dialog test adds its fake dialogs.
test.beforeEach(async ({ page }) => {
	await withoutFileDialogs(page)
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

test("with file dialogs, Save as picks a file, Save writes it again in place, and Open reads it back", async ({ page }) => {
	const name = "divider.circuit.json"
	await fakeFileDialogs(page, { saveAs: name, toOpen: { name, text: "" } })
	await page.reload()
	const resistanceOfR2 = async () => {
		const saved: { components: { id: string; params: { resistance?: number } }[] } = JSON.parse((await savedFiles(page))[name] ?? "{}")
		return saved.components.find((part) => part.id === "R2")?.params.resistance
	}

	await page.getByRole("button", { name: "Library" }).click()
	await library(page).getByRole("button", { name: "Save as file…" }).click()
	await expect(library(page).locator("[data-library-message]")).toHaveText(`Saved to ${name}.`)
	expect(await resistanceOfR2()).toBe(2)
	await library(page).getByRole("button", { name: "Close" }).click()

	await page.locator('[data-part="R2"]').click()
	const resistance = page.locator('[data-field="resistance"]')
	await resistance.fill("4")
	await resistance.press("Enter")
	await page.getByRole("button", { name: "Library" }).click()
	await library(page).getByRole("button", { name: `Save to ${name}` }).click()
	await expect(library(page).locator("[data-library-message]")).toHaveText(`Saved to ${name}.`)
	expect(await resistanceOfR2()).toBe(4)
	await library(page).getByRole("button", { name: "Close" }).click()

	await page.getByRole("button", { name: "New" }).click()
	await page.getByRole("button", { name: "Library" }).click()
	await library(page).locator("[data-library-open-file]").click()
	await expect(library(page)).toBeHidden()
	await expect(page.locator(".node-label", { hasText: "4.8 V" })).toBeVisible()
})

test("a saved circuit that no longer opens is explained and kept aside to download, not silently overwritten", async ({ page }) => {
	const damaged = '{"format": "ohmwork", "version": 6, "name": "Half'
	await page.evaluate(
		(json) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open("ohmwork", 1)
				request.onsuccess = () => {
					const transaction = request.result.transaction("workspace", "readwrite")
					transaction.objectStore("workspace").put(json, "current")
					transaction.oncomplete = () => resolve()
					transaction.onerror = () => reject(transaction.error)
				}
				request.onerror = () => reject(request.error)
			}),
		damaged,
	)
	await page.reload()
	await expect(page.getByRole("status")).toContainText("Your last circuit couldn't be opened")
	await page.waitForTimeout(800)
	await page.reload()
	await expect(page.getByRole("status")).toContainText("Your last circuit couldn't be opened")

	await page.getByRole("button", { name: "Library" }).click()
	const download = page.waitForEvent("download")
	await library(page).getByRole("button", { name: "Download damaged copy" }).click()
	expect(await readFile((await (await download).path()) ?? "", "utf8")).toBe(damaged)
	await expect(page.locator("[data-damaged-circuit]")).toHaveCount(0)
})
