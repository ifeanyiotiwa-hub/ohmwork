import type { Page } from "@playwright/test"

/** Picks a part from the palette, opening the category tab that lists it first. */
export async function choosePart(page: Page, type: string): Promise<void> {
	await page.locator(`[data-category][data-types~="${type}"]`).click()
	await page.locator(`[data-palette="${type}"]`).click()
}
