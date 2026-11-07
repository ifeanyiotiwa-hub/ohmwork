import { InjectionToken } from "@angular/core"

export type UiConfig = {
	gridSize: number
	initialView: { x: number; y: number; width: number; height: number }
	minZoomWidth: number
	maxZoomWidth: number
	zoomFactor: number
	dragThreshold: number
	agentHighlightMs: number
	simulation: {
		/** Most time steps run for one animation frame; beyond it the simulation slows down instead of freezing. */
		maxStepsPerFrame: number
		/** Longest real gap counted between frames (a hidden tab must not cause a huge catch-up). */
		maxFrameSeconds: number
	}
	scope: {
		/** The oscilloscope shows this many real seconds of the run (× the circuit's speed in simulated time). */
		windowRealSeconds: number
		/** Samples kept at most, oldest dropped first. */
		maxSamples: number
	}
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
	simulation: { maxStepsPerFrame: 2000, maxFrameSeconds: 0.1 },
	scope: { windowRealSeconds: 4, maxSamples: 8000 },
	flow: { dashPeriod: 16, minCurrent: 1e-9, pixelsPerSecondPerDecade: 12, maxPixelsPerSecond: 160 },
}

export const UI_CONFIG = new InjectionToken<UiConfig>("UI_CONFIG", {
	providedIn: "root",
	factory: () => DEFAULT_UI_CONFIG,
})
