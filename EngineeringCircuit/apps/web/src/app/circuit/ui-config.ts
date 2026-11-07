import { InjectionToken } from "@angular/core"

export type UiConfig = {
	gridSize: number
	initialView: { x: number; y: number; width: number; height: number }
	minZoomWidth: number
	maxZoomWidth: number
	zoomFactor: number
	dragThreshold: number
	agentHighlightMs: number
	flow: {
		dashPeriod: number
		minCurrent: number
		pixelsPerSecondPerDecade: number
		maxPixelsPerSecond: number
	}
}

export const DEFAULT_UI_CONFIG: UiConfig = {
	gridSize: 20,
	initialView: { x: -100, y: -160, width: 760, height: 520 },
	minZoomWidth: 200,
	maxZoomWidth: 4000,
	zoomFactor: 1.15,
	dragThreshold: 4,
	agentHighlightMs: 2000,
	flow: { dashPeriod: 16, minCurrent: 1e-9, pixelsPerSecondPerDecade: 12, maxPixelsPerSecond: 160 },
}

export const UI_CONFIG = new InjectionToken<UiConfig>("UI_CONFIG", {
	providedIn: "root",
	factory: () => DEFAULT_UI_CONFIG,
})
