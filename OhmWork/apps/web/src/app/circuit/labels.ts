import type { Component, Point } from "@ohmwork/format"
import type { SymbolShape } from "./symbols"

export type TextPlacement = { x: number; y: number; anchor: "start" | "middle" }

/** Gap between a part's name and its reading under it, and between a body and a reading below it. */
export const READING_OFFSET = 14
const SIDE_LABEL_OFFSET = { x: 24, y: -2 }

/** The part's name and value: beside an upright part, else where its symbol says (usually above). */
export function labelPlacement(symbol: SymbolShape, rotation: Component["rotation"], at: Point): TextPlacement {
	if (rotation === 90 || rotation === 270) {
		return { x: at.x + SIDE_LABEL_OFFSET.x, y: at.y + SIDE_LABEL_OFFSET.y, anchor: "start" }
	}
	return { x: at.x + symbol.label.x, y: at.y + symbol.label.y, anchor: symbol.labelAnchor }
}

/**
 * The part's live reading (a current, or a meter's value). Under the name for an upright part, a meter, or a part
 * whose name is already below it; else below the body, away from the node voltages that sit beside its pins.
 */
export function readingPlacement(
	symbol: SymbolShape,
	rotation: Component["rotation"],
	at: Point,
	isMeter: boolean,
): TextPlacement {
	const label = labelPlacement(symbol, rotation, at)
	const nameBelowBody = label.y > at.y
	if (isMeter || nameBelowBody || rotation === 90 || rotation === 270) return { ...label, y: label.y + READING_OFFSET }
	return { x: at.x, y: at.y + symbol.body.bottom + READING_OFFSET, anchor: "middle" }
}
