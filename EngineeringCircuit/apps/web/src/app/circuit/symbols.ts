import type { ComponentType, Point } from "@engineering-circuit/format"
import type { Box } from "./routing"

/** How a part is drawn. Its pin positions come from the format package (`PIN_OFFSETS`). */
export type SymbolShape = {
	/** The body wires must keep clear of, at rotation 0 (pins sit on its edge). */
	body: Box
	paths: string[]
	label: Point
	labelAnchor: "start" | "middle"
	marks?: { text: string; at: Point }[]
}

const LABEL_ABOVE = { x: 0, y: -24 }
const TWO_PIN_BODY: Box = { left: -40, top: -20, right: 40, bottom: 20 }
const METER_PATHS = ["M-40 0 H-16 M16 0 H40", "M-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0"]
const POSITIVE_LEAD_MARK = { text: "+", at: { x: -26, y: -10 } }
/** Room above the dial for the name and, under it, the big reading. */
const METER_LABEL = { x: 0, y: -42 }

export const SYMBOLS: { [Type in ComponentType]: SymbolShape } = {
	ground: {
		body: { left: -20, top: -20, right: 20, bottom: 20 },
		paths: ["M0 -20 V0 M-16 0 H16 M-10 6 H10 M-4 12 H4"],
		label: { x: 18, y: 4 },
		labelAnchor: "start",
	},
	"voltage-source": {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-16 M16 0 H40", "M-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0"],
		marks: [
			{ text: "+", at: { x: -8, y: 0 } },
			{ text: "−", at: { x: 8, y: 0 } },
		],
		label: { x: 0, y: -26 },
		labelAnchor: "middle",
	},
	"current-source": {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-16 M16 0 H40", "M-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0", "M9 0 H-9 M-3 -6 L-9 0 L-3 6"],
		label: { x: 0, y: -26 },
		labelAnchor: "middle",
	},
	resistor: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-24 L-20 -8 L-12 8 L-4 -8 L4 8 L12 -8 L20 8 L24 0 H40"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	capacitor: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-5 M-5 -14 V14 M5 -14 V14 M5 0 H40"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	inductor: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-24 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 a6 6 0 0 1 12 0 H40"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	switch: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-18 M18 0 H40", "M-18 0 a2.5 2.5 0 1 0 0.1 0 M18 0 a2.5 2.5 0 1 0 0.1 0"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	diode: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-10 M10 0 H40", "M-10 -10 V10 L10 0 Z", "M10 -10 V10"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	led: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-10 M10 0 H40", "M-10 -10 V10 L10 0 Z", "M10 -10 V10", "M0 -12 L6 -20 M3 -20 H6 V-17 M6 -10 L12 -18 M9 -18 H12 V-15"],
		label: { x: 0, y: 26 },
		labelAnchor: "middle",
	},
	"push-button": {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-18 M18 0 H40", "M-18 0 a2.5 2.5 0 1 0 0.1 0 M18 0 a2.5 2.5 0 1 0 0.1 0"],
		label: { x: 0, y: -30 },
		labelAnchor: "middle",
	},
	voltmeter: {
		body: TWO_PIN_BODY,
		paths: METER_PATHS,
		marks: [{ text: "V", at: { x: 0, y: 0 } }, POSITIVE_LEAD_MARK],
		label: METER_LABEL,
		labelAnchor: "middle",
	},
	ammeter: {
		body: TWO_PIN_BODY,
		paths: METER_PATHS,
		marks: [{ text: "A", at: { x: 0, y: 0 } }, POSITIVE_LEAD_MARK],
		label: METER_LABEL,
		labelAnchor: "middle",
	},
	ohmmeter: {
		body: TWO_PIN_BODY,
		paths: METER_PATHS,
		marks: [{ text: "Ω", at: { x: 0, y: 0 } }],
		label: METER_LABEL,
		labelAnchor: "middle",
	},
}

export const switchLeverPath = (closed: boolean) => (closed ? "M-16 0 L16 0" : "M-16 0 L14 -14")

/** A plunger bar that touches both contacts while the button conducts. */
export const pushButtonPath = (conducting: boolean) => (conducting ? "M-18 -3 H18 M0 -3 V-16" : "M-18 -11 H18 M0 -11 V-24")

export const PART_NAMES: { [Type in ComponentType]: string } = {
	ground: "Ground",
	"voltage-source": "Voltage source",
	"current-source": "Current source",
	resistor: "Resistor",
	capacitor: "Capacitor",
	inductor: "Inductor",
	switch: "Switch",
	"push-button": "Push button",
	diode: "Diode",
	led: "LED",
	voltmeter: "Voltmeter",
	ammeter: "Ammeter",
	ohmmeter: "Ohmmeter",
}
