import { type ChildProcess, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { withoutFileDialogs } from "../support/file-dialogs"

const PORT = Number(process.env["CSP_PORT"] ?? 4321)
const ORIGIN = `http://127.0.0.1:${PORT}`
const TAURI_CONFIG = "../desktop/src-tauri/tauri.conf.json"

/**
 * The desktop app's Content-Security-Policy as Tauri sends it: the policy from tauri.conf.json, plus a hash for
 * each inline script in the page (Tauri adds those at build time; styles are left alone, see ADR-025).
 */
async function desktopPolicy(html: string): Promise<string> {
	const config: { app: { security: { csp: Record<string, string> } } } = JSON.parse(await readFile(TAURI_CONFIG, "utf8"))
	const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
		([, script]) => `'sha256-${createHash("sha256").update(script ?? "").digest("base64")}'`,
	)
	const directives = { ...config.app.security.csp }
	directives["script-src"] = [directives["script-src"], ...hashes].join(" ")
	return Object.entries(directives)
		.map(([name, value]) => `${name} ${value}`)
		.join("; ")
}

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

test("under the desktop app's security policy, the app is styled, simulates and exports a picture, with nothing blocked", async ({ page }) => {
	const server = await startServer()
	try {
		const blocked: string[] = []
		page.on("console", (message) => {
			if (message.text().includes("Content Security Policy")) blocked.push(message.text())
		})
		await page.route(`${ORIGIN}/**`, async (route) => {
			const response = await route.fetch()
			if (!(response.headers()["content-type"] ?? "").startsWith("text/html")) return route.fulfill({ response })
			const html = await response.text()
			await route.fulfill({ response, body: html, headers: { ...response.headers(), "content-security-policy": await desktopPolicy(html) } })
		})
		await withoutFileDialogs(page)

		await page.goto(ORIGIN)
		await expect(page.locator(".node-label", { hasText: "4 V" })).toBeVisible()
		await expect(page.locator("link[rel=stylesheet][href^=styles]")).toHaveAttribute("media", "all")

		await page.getByRole("button", { name: "Library" }).click()
		// A component style, which Angular adds as a <style> tag at run time.
		await expect(page.getByRole("dialog", { name: "Your circuits" })).toHaveCSS("border-radius", "10px")
		const download = page.waitForEvent("download")
		await page.locator("[data-picture-png]").click()
		expect((await download).suggestedFilename()).toBe("kvl-and-voltage-divider.png")

		expect(blocked).toEqual([])
	} finally {
		server.kill()
	}
})
