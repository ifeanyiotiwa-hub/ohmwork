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

test("a box select takes notes too: R turns the group, Delete removes all, undo and redo step through it", async ({ page }) => {
	await page.locator("[data-add-note]").click()
	await expect(page.locator("[data-note]")).toBeVisible()
	await page.keyboard.press("Escape")
	const area = await canvas(page).boundingBox()
	if (!area) throw new Error("no canvas")
	await page.keyboard.down("Shift")
	await page.mouse.move(area.x + 5, area.y + 5)
	await page.mouse.down()
	await page.mouse.move(area.x + area.width - 5, area.y + area.height - 5, { steps: 5 })
	await page.mouse.up()
	await page.keyboard.up("Shift")
	await expect(page.locator("[data-note]")).toHaveClass(/selected/)

	const placeOf = (selector: string) => page.locator(selector).getAttribute("transform")
	const resistorBefore = await placeOf('[data-part="R1"]')
	await page.keyboard.press("r")
	await expect.poll(() => placeOf('[data-part="R1"]')).not.toBe(resistorBefore)

	await page.keyboard.press("Delete")
	await expect(page.locator("[data-part]")).toHaveCount(0)
	await expect(page.locator("[data-note]")).toHaveCount(0)

	await page.keyboard.press("ControlOrMeta+z")
	await expect(page.locator("[data-note]")).toHaveCount(1)
	await page.keyboard.press("ControlOrMeta+Shift+z")
	await expect(page.locator("[data-note]")).toHaveCount(0)
	await page.getByRole("button", { name: "Undo" }).click()
	await page.getByRole("button", { name: "Undo" }).click()
	await expect.poll(() => placeOf('[data-part="R1"]')).toBe(resistorBefore)
	await page.getByRole("button", { name: "Redo" }).click()
	await expect.poll(() => placeOf('[data-part="R1"]')).not.toBe(resistorBefore)
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

test("the picture frames everything drawn: a note's whole box and a part's label, not just their anchor points", async ({ page }) => {
	await page.locator("[data-add-note]").click()
	await expect(page.locator("[data-note]")).toBeVisible()
	const inCircuitUnits = (selector: string) =>
		page.evaluate((target) => {
			const canvas = document.querySelector<SVGSVGElement>('svg[aria-label="Circuit canvas"]')
			const element = document.querySelector(target)
			const toCircuit = canvas?.getScreenCTM()?.inverse()
			if (!element || !toCircuit) throw new Error(`${target} not found`)
			const box = element.getBoundingClientRect()
			const corner = new DOMPoint(box.left, box.top).matrixTransform(toCircuit)
			const opposite = new DOMPoint(box.right, box.bottom).matrixTransform(toCircuit)
			return { left: corner.x, top: corner.y, right: opposite.x, bottom: opposite.y }
		}, selector)
	const note = await inCircuitUnits("[data-note]")
	const label = await inCircuitUnits('[data-part="R2"] ~ .part-label')

	await page.getByRole("button", { name: "Library" }).click()
	const download = page.waitForEvent("download")
	await page.locator("[data-picture-svg]").click()
	const text = await readFile((await (await download).path()) ?? "", "utf8")
	const [x = 0, y = 0, width = 0, height = 0] = (/viewBox="([^"]+)"/.exec(text)?.[1] ?? "").split(" ").map(Number)
	for (const box of [note, label]) {
		expect(box.left).toBeGreaterThanOrEqual(x)
		expect(box.top).toBeGreaterThanOrEqual(y)
		expect(box.right).toBeLessThanOrEqual(x + width)
		expect(box.bottom).toBeLessThanOrEqual(y + height)
	}
})
