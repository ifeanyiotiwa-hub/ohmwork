import type { Point } from "@engineering-circuit/format"

export type View = { x: number; y: number; width: number; height: number }
export type ZoomLimits = { minWidth: number; maxWidth: number }
type FingerPair = readonly [Point, Point]

/**
 * The view after a two-finger pinch. Fingers are in screen pixels from the canvas's top left. The view scales by
 * how far apart the fingers moved (within the zoom limits), and the circuit point that was between the fingers stays
 * between them, so the same gesture also pans.
 */
export function pinchView(start: View, from: FingerPair, to: FingerPair, screenWidth: number, limits: ZoomLimits): View {
	const startDistance = distance(from)
	const nowDistance = distance(to)
	if (startDistance === 0 || nowDistance === 0) return start
	const width = Math.min(limits.maxWidth, Math.max(limits.minWidth, (start.width * startDistance) / nowDistance))
	const startScale = start.width / screenWidth
	const scale = width / screenWidth
	const startMiddle = middle(from)
	const nowMiddle = middle(to)
	const anchor = { x: start.x + startMiddle.x * startScale, y: start.y + startMiddle.y * startScale }
	return {
		x: anchor.x - nowMiddle.x * scale,
		y: anchor.y - nowMiddle.y * scale,
		width,
		height: (start.height * width) / start.width,
	}
}

const distance = ([a, b]: FingerPair) => Math.hypot(b.x - a.x, b.y - a.y)
const middle = ([a, b]: FingerPair): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
