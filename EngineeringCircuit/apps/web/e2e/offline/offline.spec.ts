import { type ChildProcess, spawn } from "node:child_process"
import { expect, test } from "@playwright/test"

const PORT = Number(process.env["OFFLINE_PORT"] ?? 4320)
const ORIGIN = `http://127.0.0.1:${PORT}`

async function startServer(): Promise<ChildProcess> {
	const server = spawn("node", ["e2e/support/static-server.mjs", "dist/web/browser", String(PORT)], { stdio: "ignore" })
	for (let attempt = 0; attempt < 50; attempt++) {
		try {
			await fetch(ORIGIN)
			return server
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}
	server.kill()
	throw new Error("static server did not start")
}

test("once loaded, the app opens and simulates even after the server is gone", async ({ page }) => {
	const server = await startServer()
	try {
		await page.goto(ORIGIN)
		await expect(page.locator(".node-label", { hasText: "4 V" })).toBeVisible()
		// The service worker takes control a moment before it can serve offline: wait until Angular's debug page
		// shows a cached app version and its first housekeeping tick (a learner has long passed this point).
		await expect
			.poll(async () => page.evaluate(async () => (await fetch("/ngsw/state")).text()), { timeout: 15_000 })
			.toMatch(/=== Version [0-9a-f]+ ===[\s\S]*Last update tick: (?!never)/)
	} finally {
		server.kill()
	}
	await expect.poll(async () => fetch(ORIGIN).then(() => "up", () => "down")).toBe("down")

	await page.reload()
	await expect(page.getByRole("application", { name: "Circuit canvas" })).toBeVisible()
	await expect(page.locator(".node-label", { hasText: "4 V" })).toBeVisible()
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "manifest.webmanifest")
})
