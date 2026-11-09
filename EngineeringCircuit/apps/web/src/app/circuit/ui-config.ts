import { InjectionToken } from "@angular/core"

export type UiConfig = {
	gridSize: number
	initialView: { x: number; y: number; width: number; height: number }
	minZoomWidth: number
	maxZoomWidth: number
	zoomFactor: number
	dragThreshold: number
	/** How long a finger is held still on a touch screen to act as Shift (select several). */
	longPressMs: number
	/** How far (screen pixels) a finger may drift during a long press: fingers are not as still as a mouse. */
	longPressSlopPx: number
	/** Value dial: pixels of drag per step, how far the knob turns per step, and the pause that ends one turn of clicks, wheel notches or keys. */
	dial: { pixelsPerStep: number; degreesPerStep: number; turnIdleMs: number }
	/** An LED 7-segment's segment shows lit above this share of its full-brightness current. */
	segmentLitFraction: number
	/** Drawn pin radius, canvas units. The click/tap target is half a grid step, the most that never overlaps a neighbour. */
	pinRadius: number
	agentHighlightMs: number
	simulation: {
		/** Most time steps run for one animation frame; beyond it the simulation slows down instead of freezing. */
		maxStepsPerFrame: number
		/** Longest real gap counted between frames (a hidden tab must not cause a huge catch-up). */
		maxFrameSeconds: number
	}
	library: {
		/** Saved circuits listed at most (newest first). */
		maxEntries: number
		/** The circuit being edited is saved this long after the last change. */
		autosaveDelayMs: number
		/** Largest circuit file the app opens. */
		maxFileBytes: number
		/** Space around the circuit in a downloaded picture, in canvas units. */
		pictureMargin: number
		/** A PNG picture has this many pixels per canvas unit. */
		pngScale: number
	}
	live: {
		/** Pauses between tries to reach the live link again after a drop (the last one repeats). */
		reconnectDelaysMs: readonly number[]
		/** Tries before giving up and working alone. */
		maxReconnectAttempts: number
	}
	scope: {
		/** The oscilloscope shows this many real seconds of the run (× the circuit's speed in simulated time). */
		windowRealSeconds: number
		/** Samples kept at most, oldest dropped first. */
		maxSamples: number
		/** Windows of samples kept, so a triggered view can look back for a crossing. */
		historyWindows: number
	}
	/** A motor's rotor on screen (see spinOf). */
	spin: { minSecondsPerTurn: number; maxSecondsPerTurn: number }
	/** The oscilloscope's frequency view: the sweep, in hertz (log scale). */
	bode: { startHz: number; stopHz: number; pointsPerDecade: number }
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
	longPressMs: 500,
	longPressSlopPx: 10,
	pinRadius: 5,
	segmentLitFraction: 0.1,
	dial: { pixelsPerStep: 10, degreesPerStep: 30, turnIdleMs: 1000 },
	agentHighlightMs: 2000,
	simulation: { maxStepsPerFrame: 2000, maxFrameSeconds: 0.1 },
	scope: { windowRealSeconds: 4, maxSamples: 16000, historyWindows: 2 },
	spin: { minSecondsPerTurn: 0.25, maxSecondsPerTurn: 30 },
	bode: { startHz: 1, stopHz: 1e6, pointsPerDecade: 20 },
	live: { reconnectDelaysMs: [1000, 2000, 4000, 8000], maxReconnectAttempts: 30 },
	library: { maxEntries: 200, autosaveDelayMs: 500, maxFileBytes: 5 * 1024 * 1024, pictureMargin: 60, pngScale: 2 },
	flow: { dashPeriod: 16, minCurrent: 1e-9, pixelsPerSecondPerDecade: 12, maxPixelsPerSecond: 160 },
}

export const UI_CONFIG = new InjectionToken<UiConfig>("UI_CONFIG", {
	providedIn: "root",
	factory: () => DEFAULT_UI_CONFIG,
})
