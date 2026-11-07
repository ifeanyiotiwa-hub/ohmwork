import type { ComponentType, Point } from "@engineering-circuit/format"

export type SymbolShape = {
	pins: Record<string, Point>
	paths: string[]
	label: Point
}

const LEADS = { a: { x: -40, y: 0 }, b: { x: 40, y: 0 } }
const SOURCE_LEADS = { positive: { x: -40, y: 0 }, negative: { x: 40, y: 0 } }
const DIODE_LEADS = { anode: { x: -40, y: 0 }, cathode: { x: 40, y: 0 } }
const LABEL_ABOVE = { x: 0, y: -24 }

export const SYMBOLS: { [Type in ComponentType]: SymbolShape } = {
	ground: {
		pins: { terminal: { x: 0, y: -20 } },
		paths: ["M0 -20 V0 M-16 0 H16 M-10 6 H10 M-4 12 H4"],
		label: { x: 18, y: 4 },
	},
	"voltage-source": {
		pins: SOURCE_LEADS,
		paths: ["M-40 0 H-16 M16 0 H40", "M-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0", "M-9 -4 V4 M-13 0 H-5 M5 0 H13"],
		label: { x: 0, y: -26 },
	},
	"current-source": {
		pins: SOURCE_LEADS,
		paths: ["M-40 0 H-16 M16 0 H40", "M-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0", "M9 0 H-9 M-3 -6 L-9 0 L-3 6"],
		label: { x: 0, y: -26 },
	},
	resistor: {
		pins: LEADS,
		paths: ["M-40 0 H-24 L-20 -8 L-12 8 L-4 -8 L4 8 L12 -8 L20 8 L24 0 H40"],
		label: LABEL_ABOVE,
	},
	capacitor: {
		pins: LEADS,
		paths: ["M-40 0 H-5 M-5 -14 V14 M5 -14 V14 M5 0 H40"],
		label: LABEL_ABOVE,
	},
	inductor: {
		pins: LEADS,
		paths: ["M-40 0 H-24 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 H40"],
		label: LABEL_ABOVE,
	},
	switch: {
		pins: LEADS,
		paths: ["M-40 0 H-18 M18 0 H40", "M-18 0 a2.5 2.5 0 1 0 0.1 0 M18 0 a2.5 2.5 0 1 0 0.1 0"],
		label: LABEL_ABOVE,
	},
	diode: {
		pins: DIODE_LEADS,
		paths: ["M-40 0 H-10 M10 0 H40", "M-10 -10 V10 L10 0 Z", "M10 -10 V10"],
		label: LABEL_ABOVE,
	},
	led: {
		pins: DIODE_LEADS,
		paths: ["M-40 0 H-10 M10 0 H40", "M-10 -10 V10 L10 0 Z", "M10 -10 V10", "M0 -12 L6 -20 M3 -20 H6 V-17 M6 -10 L12 -18 M9 -18 H12 V-15"],
		label: { x: 0, y: 26 },
	},
}

export const switchLeverPath = (closed: boolean) => (closed ? "M-16 0 L16 0" : "M-16 0 L14 -14")
