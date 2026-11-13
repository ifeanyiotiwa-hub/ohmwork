import AxeBuilder from "@axe-core/playwright"
import { type Page, expect, test } from "@playwright/test"

/*
 * Every screen the app has, scanned against WCAG 2.2 A and AA (axe-core). The rules axe can check are about a third
 * of WCAG; the rest (reading order, what a screen reader announces, keyboard flow) has its own tests and the audit
 * notes in projectKnowledge.
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

async function violationsOf(page: Page): Promise<string[]> {
	const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
	return results.violations.flatMap((violation) =>
		violation.nodes.map((node) => `${violation.id} (${violation.impact}): ${node.target.join(" ")}: ${node.failureSummary ?? ""}`),
	)
}

const SCREENS: { name: string; desktopOnly?: boolean; open: (page: Page) => Promise<void> }[] = [
	{ name: "the example circuit", open: async () => {} },
	{
		name: "the parts panel",
		open: async (page) => {
			await page.locator('[data-category="Passive"]').click()
			await expect(page.locator("[data-parts-panel]")).toBeVisible()
		},
	},
	{
		name: "the sidebar narrowed to icons",
		desktopOnly: true,
		open: async (page) => {
			await page.locator("[data-rail-toggle]").click()
		},
	},
	{
		name: "a part selected, shown on the oscilloscope",
		open: async (page) => {
			await page.locator("[data-part]").first().click()
			await page.locator("[data-watch]").click()
			await expect(page.locator("app-scope-view")).toBeVisible()
		},
	},
	{
		name: "the library",
		open: async (page) => {
			await page.getByRole("button", { name: "Library" }).click()
			await expect(page.getByRole("dialog")).toBeVisible()
		},
	},
	{
		name: "the lessons",
		open: async (page) => {
			await page.getByRole("button", { name: "Lessons" }).click()
			await expect(page.getByRole("dialog")).toBeVisible()
		},
	},
	{
		name: "the parts browser",
		open: async (page) => {
			await page.getByRole("button", { name: "Find a part" }).click()
			await expect(page.getByRole("dialog")).toBeVisible()
		},
	},
]

for (const screen of SCREENS) {
	for (const size of [
		{ label: "desktop", width: 1280, height: 800 },
		{ label: "phone", width: 390, height: 844 },
	]) {
		test(`${screen.name} (${size.label}) passes WCAG 2.2 AA checks`, async ({ page }) => {
			test.skip(screen.desktopOnly === true && size.label === "phone", "a phone has no sidebar to narrow")
			await page.setViewportSize(size)
			await page.goto("/")
			await expect(page.locator("[data-part]").first()).toBeVisible()
			await screen.open(page)
			expect(await violationsOf(page)).toEqual([])
		})
	}
}
