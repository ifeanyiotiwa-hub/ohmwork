// Renders an SVG icon to square PNGs with Playwright's Chromium (no image tools needed).
// Usage: node scripts/render-icon.mjs public/icons/icon-maskable.svg public/icons/icon-maskable 192 512
// writes public/icons/icon-maskable-192x192.png and …-512x512.png.
import { readFile } from "node:fs/promises"
import { chromium } from "@playwright/test"

const [source, prefix, ...sizes] = process.argv.slice(2)
if (!source || !prefix || sizes.length === 0) {
	console.error("Usage: node scripts/render-icon.mjs <icon.svg> <output prefix> <size>...")
	process.exit(1)
}
const svg = await readFile(source, "utf8")
const browser = await chromium.launch()
try {
	for (const size of sizes.map(Number)) {
		const page = await browser.newPage({ viewport: { width: size, height: size } })
		const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `)
		await page.setContent(`<html><body style="margin:0">${sized}</body></html>`)
		await page.locator("svg").screenshot({ path: `${prefix}-${size}x${size}.png`, omitBackground: true })
		await page.close()
	}
} finally {
	await browser.close()
}
