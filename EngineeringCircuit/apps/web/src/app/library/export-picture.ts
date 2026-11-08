import type { Circuit } from "@engineering-circuit/format"
import { fileNameFor } from "./circuit-files"

export type Bounds = { x: number; y: number; width: number; height: number }

/** Everything in the circuit (part positions and note corners), with `margin` around it, in circuit units. */
export function pictureBounds(circuit: Circuit, margin: number): Bounds {
	const points = [...circuit.components.map((part) => part.position), ...circuit.notes.map((note) => note.position)]
	const xs = points.length > 0 ? points.map((point) => point.x) : [0]
	const ys = points.length > 0 ? points.map((point) => point.y) : [0]
	const left = Math.min(...xs) - margin
	const top = Math.min(...ys) - margin
	return { x: left, y: top, width: Math.max(...xs) + margin - left, height: Math.max(...ys) + margin - top }
}

/** Styles copied from the page into the picture, so it looks the same outside the app. */
const STYLE_PROPERTIES = [
	"fill",
	"fill-opacity",
	"stroke",
	"stroke-width",
	"stroke-dasharray",
	"stroke-linecap",
	"stroke-linejoin",
	"opacity",
	"font-family",
	"font-size",
	"font-weight",
	"text-anchor",
	"dominant-baseline",
	"filter",
] as const
/** Click targets and moving current dots: interaction and animation, not part of a picture. */
const LEAVE_OUT = ".part-hit, .wire-hit, .wire-flow, .pin, .rubber-band, .selection-box"

/** The canvas as a standalone SVG of the whole circuit, styles inlined, on the canvas background. */
export function circuitSvg(canvas: SVGSVGElement, bounds: Bounds, background: string): string {
	const clone = canvas.cloneNode(true) as SVGSVGElement
	const originals = [...canvas.querySelectorAll<SVGElement>("*")]
	;[...clone.querySelectorAll<SVGElement>("*")].forEach((element, index) => {
		const original = originals[index]
		if (!original) return
		const computed = getComputedStyle(original)
		const style = STYLE_PROPERTIES.map((property) => `${property}:${computed.getPropertyValue(property)}`).join(";")
		element.setAttribute("style", `${style};${element.getAttribute("style") ?? ""}`)
	})
	clone.querySelectorAll(LEAVE_OUT).forEach((element) => element.remove())
	clone.querySelector(".grid")?.remove()
	clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
	clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)
	clone.setAttribute("width", String(bounds.width))
	clone.setAttribute("height", String(bounds.height))
	const backdrop = canvas.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect")
	for (const [name, value] of Object.entries({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, fill: background })) {
		backdrop.setAttribute(name, String(value))
	}
	clone.insertBefore(backdrop, clone.firstChild)
	return new XMLSerializer().serializeToString(clone)
}

/** The picture's file name: `<circuit name>.svg` or `.png`. */
export const pictureName = (circuit: Circuit, extension: "svg" | "png") =>
	`${fileNameFor(circuit).replace(/\.circuit\.json$/, "")}.${extension}`

export const svgBlob = (svg: string) => new Blob([svg], { type: "image/svg+xml" })

/** Draws the SVG at `scale` on a canvas, as a PNG. */
export async function pngBlob(svg: string, bounds: Bounds, scale: number, document: Document): Promise<Blob> {
	const url = URL.createObjectURL(svgBlob(svg))
	try {
		const image = new Image()
		image.src = url
		await image.decode()
		const canvas = document.createElement("canvas")
		canvas.width = Math.round(bounds.width * scale)
		canvas.height = Math.round(bounds.height * scale)
		canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
		const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
		if (!png) throw new Error("The browser could not make a PNG.")
		return png
	} finally {
		URL.revokeObjectURL(url)
	}
}
