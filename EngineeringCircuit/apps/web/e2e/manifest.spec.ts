import { expect, test } from "@playwright/test"

type ManifestIcon = { src: string; sizes: string; purpose: string }

test("the install manifest has a stable id, and every icon it lists loads, with separate maskable ones", async ({ request }) => {
	const response = await request.get("/manifest.webmanifest")
	expect(response.ok()).toBe(true)
	const manifest: { id?: string; icons: ManifestIcon[] } = await response.json()
	expect(manifest.id).toBe("engineering-circuit")
	for (const icon of manifest.icons) {
		const image = await request.get(`/${icon.src}`)
		expect(image.ok(), icon.src).toBe(true)
		expect(image.headers()["content-type"], icon.src).toContain("image/png")
	}
	const maskable = manifest.icons.filter((icon) => icon.purpose === "maskable").map((icon) => icon.sizes)
	expect(maskable).toEqual(["192x192", "512x512"])
	// An icon is either full art ("any") or padded for masking, never both: one image can't be right for both.
	expect(manifest.icons.every((icon) => icon.purpose === "any" || icon.purpose === "maskable")).toBe(true)
})
