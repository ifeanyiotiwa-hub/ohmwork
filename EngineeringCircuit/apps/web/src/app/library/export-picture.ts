import type { Circuit } from "@engineering-circuit/format"
import { fileNameFor } from "./circuit-files"

export type Bounds = { x: number; y: number; width: number; height: number }

/** The box around everything drawn (each a box in circuit units), with `margin` around it. */
export function pictureBounds(drawn: readonly Bounds[], margin: number): Bounds {
	if (drawn.length === 0) return { x: -margin, y: -margin, width: 2 * margin, height: 2 * margin }
	const left = Math.min(...drawn.map((box) => box.x)) - margin
	const top = Math.min(...drawn.map((box) => box.y)) - margin
	const right = Math.max(...drawn.map((box) => box.x + box.width)) + margin
	const bottom = Math.max(...drawn.map((box) => box.y + box.height)) + margin
	return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Each shape and text drawn on the canvas, as a box in circuit units: measured as rendered, so rotated bodies, label
 * text and notes count at their real size. Click targets, pins, the grid and moving current dots are left out.
 */
export function drawnBoxes(canvas: SVGSVGElement): Bounds[] {
	const toCircuit = canvas.getScreenCTM()?.inverse()
	if (!toCircuit) return []
	const shapes = [...canvas.querySelectorAll<SVGGraphicsElement>(DRAWN)].filter(
		(shape) => !shape.closest(`${LEAVE_OUT}, .grid, defs`),
	)
	return shapes.flatMap((shape) => {
		const screen = shape.getBoundingClientRect()
		if (screen.width === 0 && screen.height === 0) return []
		const corner = new DOMPoint(screen.left, screen.top).matrixTransform(toCircuit)
		const opposite = new DOMPoint(screen.right, screen.bottom).matrixTransform(toCircuit)
		return [{ x: corner.x, y: corner.y, width: opposite.x - corner.x, height: opposite.y - corner.y }]
	})
}

const DRAWN = "path, line, polyline, polygon, circle, ellipse, rect, text"

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
const LEAVE_OUT = ".part-hit, .wire-hit, .wire-flow, .pin, .pin-hit, .rubber-band, .selection-box, .dial, .readout, .wiper-hit, .smoke"

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
