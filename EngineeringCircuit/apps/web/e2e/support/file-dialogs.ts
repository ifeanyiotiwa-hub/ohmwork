import type { Page } from "@playwright/test"

/**
 * Hides the File System Access API (Chrome's file dialogs), so the page behaves like Firefox or Safari:
 * files download and open through the file input. Call before the page loads.
 */
export async function withoutFileDialogs(page: Page): Promise<void> {
	await page.addInitScript(() => {
		for (const name of ["showSaveFilePicker", "showOpenFilePicker"]) {
			Reflect.deleteProperty(Window.prototype, name)
			Reflect.deleteProperty(window, name)
		}
	})
}

/**
 * Replaces Chrome's file dialogs, which a test can't click, with an in-memory disk: Save as writes `saveAs`, Open
 * returns `toOpen`. Written files are read back with `savedFiles`. Call before the page loads.
 */
export async function fakeFileDialogs(page: Page, choices: { saveAs: string; toOpen?: { name: string; text: string } }): Promise<void> {
	await page.addInitScript((given) => {
		const disk = new Map<string, Blob>()
		if (given.toOpen) disk.set(given.toOpen.name, new Blob([given.toOpen.text]))
		const handle = (name: string) => ({
			name,
			getFile: async () => new File([disk.get(name) ?? new Blob()], name),
			createWritable: async () => ({
				write: async (data: Blob) => void disk.set(name, data),
				close: async () => undefined,
			}),
		})
		Object.assign(window, {
			showSaveFilePicker: async () => handle(given.saveAs),
			showOpenFilePicker: async () => (given.toOpen ? [handle(given.toOpen.name)] : []),
			fakeDisk: async () => Object.fromEntries(await Promise.all([...disk].map(async ([name, blob]) => [name, await blob.text()]))),
		})
	}, choices)
}

export async function savedFiles(page: Page): Promise<Record<string, string>> {
	return page.evaluate(() => (window as unknown as { fakeDisk: () => Promise<Record<string, string>> }).fakeDisk())
}
