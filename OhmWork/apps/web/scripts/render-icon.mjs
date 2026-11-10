// Renders an SVG icon to square PNGs, or to one .ico holding several sizes, with Playwright's Chromium (no image tools needed).
// Usage: node scripts/render-icon.mjs public/icons/icon-maskable.svg public/icons/icon-maskable 192 512
// writes public/icons/icon-maskable-192x192.png and …-512x512.png;
// node scripts/render-icon.mjs public/favicon.svg public/favicon.ico 16 32 48 writes one .ico with the three sizes.
import { readFile, writeFile } from "node:fs/promises"
import { chromium } from "@playwright/test"

const [source, target, ...sizes] = process.argv.slice(2)
if (!source || !target || sizes.length === 0) {
	console.error("Usage: node scripts/render-icon.mjs <icon.svg> <output prefix | file.ico> <size>...")
	process.exit(1)
}

/** An .ico of PNG images (supported by every current browser and by Windows since Vista): a directory, then the PNGs. */
function icoOf(images) {
	const headerSize = 6
	const entrySize = 16
	const header = Buffer.alloc(headerSize + entrySize * images.length)
	header.writeUInt16LE(0, 0)
	header.writeUInt16LE(1, 2)
	header.writeUInt16LE(images.length, 4)
	let offset = header.length
	images.forEach(({ size, png }, index) => {
		const entry = headerSize + entrySize * index
		// Width and height 256 are written as 0.
		header.writeUInt8(size >= 256 ? 0 : size, entry)
		header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
		header.writeUInt8(0, entry + 2)
		header.writeUInt8(0, entry + 3)
		header.writeUInt16LE(1, entry + 4)
		header.writeUInt16LE(32, entry + 6)
		header.writeUInt32LE(png.length, entry + 8)
		header.writeUInt32LE(offset, entry + 12)
		offset += png.length
	})
	return Buffer.concat([header, ...images.map(({ png }) => png)])
}

const svg = await readFile(source, "utf8")
const browser = await chromium.launch()
try {
	const images = []
	for (const size of sizes.map(Number)) {
		const page = await browser.newPage({ viewport: { width: size, height: size } })
		const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `)
		await page.setContent(`<html><body style="margin:0">${sized}</body></html>`)
		const png = await page.locator("svg").screenshot({ omitBackground: true })
		images.push({ size, png })
		await page.close()
	}
	if (target.endsWith(".ico")) {
		await writeFile(target, icoOf(images))
	} else {
		await Promise.all(images.map(({ size, png }) => writeFile(`${target}-${size}x${size}.png`, png)))
	}
} finally {
	await browser.close()
}
