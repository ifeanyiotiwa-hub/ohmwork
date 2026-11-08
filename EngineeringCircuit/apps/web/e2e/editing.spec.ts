import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { withoutFileDialogs } from "./support/file-dialogs"
import { choosePart } from "./support/parts"

test.beforeEach(async ({ page }) => {
	await withoutFileDialogs(page)
	await page.goto("/")
})

const canvas = (page: import("@playwright/test").Page) => page.getByRole("application", { name: "Circuit canvas" })

test("finishing a wire on another wire joins them with a junction, undone in one step", async ({ page }) => {
	await choosePart(page, "resistor")
	await canvas(page).click({ position: { x: 760, y: 120 } })
	await page.keyboard.press("Escape")
	const wires = page.locator("[data-wire]")
	await expect(wires).toHaveCount(4)

	await page.locator('[data-pin="R3:a"]').click()
	// The example's first wire runs up from the battery and along the top to R1: click on its top run.
	const top = page.locator('[data-wire="w1"] .wire-line')
	const box = await top.boundingBox()
	if (!box) throw new Error("wire not drawn")
	await page.mouse.click(box.x + box.width / 2, box.y + 1)

	await expect(page.locator('[data-part="J1"]')).toBeVisible()
	await expect(wires).toHaveCount(6)
	await expect(page.locator(".node-label", { hasText: "6 V" }).first()).toBeVisible()

	await page.getByRole("button", { name: "Undo" }).click()
	await expect(page.locator('[data-part="J1"]')).toHaveCount(0)
	await expect(wires).toHaveCount(4)
})

test("Shift-click two parts, copy and paste: new parts, wired alike, undone in one step", async ({ page }) => {
	await page.locator('[data-part="R1"]').click({ modifiers: ["Shift"] })
	await page.locator('[data-part="R2"]').click({ modifiers: ["Shift"] })
	await page.keyboard.press("ControlOrMeta+c")
	await page.keyboard.press("ControlOrMeta+v")
	await expect(page.locator('[data-part="R3"]')).toBeVisible()
	await expect(page.locator('[data-part="R4"]')).toBeVisible()
	await expect(page.locator("[data-wire]")).toHaveCount(5)

	await page.getByRole("button", { name: "Undo" }).click()
	await expect(page.locator('[data-part="R3"]')).toHaveCount(0)
	await expect(page.locator('[data-part="R4"]')).toHaveCount(0)
})

test("a Shift-drag box selects parts; Delete removes them all", async ({ page }) => {
	const area = await canvas(page).boundingBox()
	if (!area) throw new Error("no canvas")
	await page.keyboard.down("Shift")
	await page.mouse.move(area.x + 5, area.y + 5)
	await page.mouse.down()
	await page.mouse.move(area.x + area.width - 5, area.y + area.height - 5, { steps: 5 })
	await page.mouse.up()
	await page.keyboard.up("Shift")
	await page.keyboard.press("Delete")
	await expect(page.locator("[data-part]")).toHaveCount(0)
})

test("the circuit downloads as an SVG and a PNG picture", async ({ page }) => {
	await page.getByRole("button", { name: "Library" }).click()
	const dialog = page.getByRole("dialog", { name: "Your circuits" })

	const svgDownload = page.waitForEvent("download")
	await dialog.locator("[data-picture-svg]").click()
	const svg = await svgDownload
	expect(svg.suggestedFilename()).toBe("kvl-and-voltage-divider.svg")
	const text = await readFile((await svg.path()) ?? "", "utf8")
	expect(text).toContain("<svg")
	expect(text).toContain("R2")
	expect(text).not.toContain("wire-flow")

	const pngDownload = page.waitForEvent("download")
	await dialog.locator("[data-picture-png]").click()
	const png = await pngDownload
	expect(png.suggestedFilename()).toBe("kvl-and-voltage-divider.png")
	const bytes = await readFile((await png.path()) ?? "")
	expect(bytes.subarray(1, 4).toString()).toBe("PNG")
})
