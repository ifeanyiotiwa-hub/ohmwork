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

/** Controlled sources: a diamond on the output side (right); control or sense pins on the left. */
const DIAMOND = "M14 -16 L30 0 L14 16 L-2 0 Z"
const OUTPUT_LEADS = "M40 -20 H14 V-16 M40 20 H14 V16"
const VOLTAGE_CONTROL = "M-40 -20 H-26 M-40 20 H-26"
const CURRENT_SENSE = "M-40 -20 H-22 V20 H-40 M-26 -4 L-22 4 L-18 -4"
const VOLTAGE_OUTPUT_MARKS = [
	{ text: "+", at: { x: 14, y: -6 } },
	{ text: "−", at: { x: 14, y: 7 } },
]
const CURRENT_OUTPUT_ARROW = "M14 9 V-9 M9 -4 L14 -9 L19 -4"
const CONTROL_MARKS = [
	{ text: "+", at: { x: -30, y: -9 } },
	{ text: "−", at: { x: -30, y: 9 } },
]
const CONTROLLED_BODY: Box = { left: -40, top: -20, right: 40, bottom: 20 }
const CONTROLLED_LABEL = { x: 0, y: -30 }

/** Transistors: base or gate lead from the left, collector or drain up, emitter or source down. */
const TRANSISTOR_BODY: Box = { left: -40, top: -40, right: 30, bottom: 40 }
const TRANSISTOR_LABEL = { x: 34, y: 4 }
const BIPOLAR_PATHS = ["M-40 0 H-6 M-6 -14 V14", "M-6 -7 L20 -24 V-40 M-6 7 L20 24 V40", "M-16 0 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0"]
// Logic: IEEE distinctive gate shapes; inputs on the left (a above b), output on the right.
const GATE_BODY: Box = { left: -40, top: -24, right: 40, bottom: 24 }
const GATE_LABEL = { x: 0, y: -30 }
const AND_LEADS = "M-40 -20 H-20 M-40 20 H-20"
const AND_SHAPE = "M-20 -24 H0 A24 24 0 0 1 0 24 H-20 Z"
const OR_LEADS = "M-40 -20 H-19 M-40 20 H-19"
const OR_SHAPE = "M-24 -24 Q-10 0 -24 24 Q8 24 22 0 Q8 -24 -24 -24 Z"
const XOR_EXTRA = "M-31 -24 Q-17 0 -31 24"
const bubbleAt = (x: number) => `M${x} 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0`
const gateSymbol = (paths: string[]): SymbolShape => ({ body: GATE_BODY, paths, label: GATE_LABEL, labelAnchor: "middle" })
// Three inputs fit the two-input body; the middle lead meets the OR curve further in (its back bulges at y = 0).
const AND_3_LEADS = "M-40 -20 H-20 M-40 0 H-20 M-40 20 H-20"
const OR_3_LEADS = "M-40 -20 H-19 M-40 0 H-17 M-40 20 H-19"
// Four inputs: the same shapes stretched to ±44, output one grid step further out (pins.ts GATE_4_LEADS).
const GATE_4_BODY: Box = { left: -40, top: -44, right: 60, bottom: 44 }
const AND_4_LEADS = "M-40 -40 H-20 M-40 -20 H-20 M-40 20 H-20 M-40 40 H-20"
const AND_4_SHAPE = "M-20 -44 H4 A44 44 0 0 1 4 44 H-20 Z"
const OR_4_LEADS = "M-40 -40 H-22.8 M-40 -20 H-18.4 M-40 20 H-18.4 M-40 40 H-22.8"
const OR_4_SHAPE = "M-24 -44 Q-10 0 -24 44 Q12 44 46 0 Q12 -44 -24 -44 Z"
const gate4Symbol = (paths: string[]): SymbolShape => ({ body: GATE_4_BODY, paths, label: { x: 10, y: -54 }, labelAnchor: "middle" })

/** Flip-flops and latches: a box with its pin names inside; a clock input is marked with a triangle. */
const BOX_BODY: Box = { left: -40, top: -32, right: 40, bottom: 32 }
const BOX = "M-24 -32 H24 V32 H-24 Z"
const BOX_LEADS = "M-40 -20 H-24 M-40 20 H-24 M24 -20 H40 M24 20 H40"
const CLOCK_MARK = (y: number) => `M-24 ${y - 6} L-16 ${y} L-24 ${y + 6}`
const pinMark = (text: string, x: number, y: number) => ({ text, at: { x, y } })
const Q_MARKS = [pinMark("Q", 14, -20), pinMark("Q̄", 14, 20)]
const boxSymbol = (paths: string[], marks: { text: string; at: Point }[]): SymbolShape => ({
	body: BOX_BODY,
	paths: [BOX, BOX_LEADS, ...paths],
	marks,
	label: { x: 0, y: -38 },
	labelAnchor: "middle",
})
const SOURCE_BOX = "M-20 -14 H20 V14 H-20 Z M20 0 H40"

/** The 7-segment digit's segments a–g and the decimal point, drawn inside the display box. */
export const SEVEN_SEGMENT_PATHS: Readonly<Record<string, string>> = {
	a: "M-4 -30 H16",
	b: "M18 -28 V-2",
	c: "M18 2 V28",
	d: "M-4 30 H16",
	e: "M-6 2 V28",
	f: "M-6 -28 V-2",
	g: "M-4 0 H16",
	dp: "M24 30 h0.1",
}
const chipBox = (top: number, bottom: number) => `M-24 ${top} H24 V${bottom} H-24 Z`
const leadsLeft = (ys: number[]) => ys.map((y) => `M-40 ${y} H-24`).join(" ")
const leadsRight = (ys: number[]) => ys.map((y) => `M24 ${y} H40`).join(" ")
/** An 8-bit converter's data pins d0…d7 (pins.ts) and the weight each one carries, 1 to 128. */
const BYTE_YS = Array.from({ length: 8 }, (_, index) => -70 + index * 20)
const BYTE_WEIGHTS = BYTE_YS.map((_, index) => String(1 << index))
const SOURCE_BOX_BODY: Box = { left: -20, top: -16, right: 40, bottom: 16 }

const MOSFET_PATHS = ["M-40 0 H-12 M-12 -14 V14", "M-4 -16 V16", "M-4 -10 H20 V-40 M-4 10 H20 V40"]
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
	"ac-source": {
		body: TWO_PIN_BODY,
		paths: [...METER_PATHS, "M-10 0 C-7 -11 -3 -11 0 0 C3 11 7 11 10 0"],
		marks: [POSITIVE_LEAD_MARK],
		label: { x: 0, y: -26 },
		labelAnchor: "middle",
	},
	"square-source": {
		body: TWO_PIN_BODY,
		paths: [...METER_PATHS, "M-10 6 H-5 V-6 H2 V6 H8 V-6"],
		marks: [POSITIVE_LEAD_MARK],
		label: { x: 0, y: -26 },
		labelAnchor: "middle",
	},
	vcvs: {
		body: CONTROLLED_BODY,
		paths: [VOLTAGE_CONTROL, OUTPUT_LEADS, DIAMOND],
		marks: [...CONTROL_MARKS, ...VOLTAGE_OUTPUT_MARKS],
		label: CONTROLLED_LABEL,
		labelAnchor: "middle",
	},
	vccs: {
		body: CONTROLLED_BODY,
		paths: [VOLTAGE_CONTROL, OUTPUT_LEADS, DIAMOND, CURRENT_OUTPUT_ARROW],
		marks: CONTROL_MARKS,
		label: CONTROLLED_LABEL,
		labelAnchor: "middle",
	},
	ccvs: {
		body: CONTROLLED_BODY,
		paths: [CURRENT_SENSE, OUTPUT_LEADS, DIAMOND],
		marks: VOLTAGE_OUTPUT_MARKS,
		label: CONTROLLED_LABEL,
		labelAnchor: "middle",
	},
	cccs: {
		body: CONTROLLED_BODY,
		paths: [CURRENT_SENSE, OUTPUT_LEADS, DIAMOND, CURRENT_OUTPUT_ARROW],
		label: CONTROLLED_LABEL,
		labelAnchor: "middle",
	},
	resistor: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-24 L-20 -8 L-12 8 L-4 -8 L4 8 L12 -8 L20 8 L24 0 H40"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	junction: {
		body: { left: -6, top: -6, right: 6, bottom: 6 },
		paths: ["M-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0"],
		label: { x: 0, y: -12 },
		labelAnchor: "middle",
	},
	capacitor: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-5 M-5 -14 V14 M5 -14 V14 M5 0 H40"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	"polarized-capacitor": {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-5 M-5 -14 V14 M3 0 H40", "M9 -14 Q1 0 9 14"],
		marks: [{ text: "+", at: { x: -14, y: -12 } }],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	potentiometer: {
		body: TWO_PIN_BODY,
		// The wiper is drawn at its position by potentiometerWiper.
		paths: ["M-40 0 H-24 L-20 -8 L-12 8 L-4 -8 L4 8 L12 -8 L20 8 L24 0 H40"],
		label: { x: 26, y: -30 },
		labelAnchor: "start",
	},
	lamp: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-14 M14 0 H40", "M-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0", "M-10 -10 L10 10 M-10 10 L10 -10"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	transformer: {
		body: { left: -40, top: -40, right: 40, bottom: 40 },
		paths: [
			"M-40 -40 H-14 V-24 M-40 40 H-14 V24",
			"M-14 -24 a6 6 0 0 1 0 12 a6 6 0 0 1 0 12 a6 6 0 0 1 0 12 a6 6 0 0 1 0 12",
			"M40 -40 H14 V-24 M40 40 H14 V24",
			"M14 -24 a6 6 0 0 0 0 12 a6 6 0 0 0 0 12 a6 6 0 0 0 0 12 a6 6 0 0 0 0 12",
			"M-3 -26 V26 M3 -26 V26",
		],
		label: { x: 0, y: -50 },
		labelAnchor: "middle",
	},
	// The transformer with a lead from the middle of its secondary (between its second and third loops).
	"tapped-transformer": {
		body: { left: -40, top: -40, right: 40, bottom: 40 },
		paths: [
			"M-40 -40 H-14 V-24 M-40 40 H-14 V24",
			"M-14 -24 a6 6 0 0 1 0 12 a6 6 0 0 1 0 12 a6 6 0 0 1 0 12 a6 6 0 0 1 0 12",
			"M40 -40 H14 V-24 M40 40 H14 V24",
			"M14 -24 a6 6 0 0 0 0 12 a6 6 0 0 0 0 12 a6 6 0 0 0 0 12 a6 6 0 0 0 0 12",
			"M-3 -26 V26 M3 -26 V26",
			"M14 0 H40",
		],
		label: { x: 0, y: -50 },
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
	"zener-diode": {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-10 M10 0 H40", "M-10 -10 V10 L10 0 Z", "M6 -13 L10 -10 V10 L14 13"],
		label: LABEL_ABOVE,
		labelAnchor: "middle",
	},
	"rgb-led": {
		body: { left: -40, top: -20, right: 40, bottom: 20 },
		paths: ["M-40 -20 H-12 M-40 0 H-16 M-40 20 H-12 M16 0 H40", "M-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0"],
		marks: [
			{ text: "R", at: { x: -26, y: -28 } },
			{ text: "G", at: { x: -26, y: -8 } },
			{ text: "B", at: { x: -26, y: 12 } },
		],
		label: { x: 0, y: -30 },
		labelAnchor: "middle",
	},
	"npn-transistor": {
		body: TRANSISTOR_BODY,
		paths: [...BIPOLAR_PATHS, "M9 23 L18 25 L15 16 Z"],
		label: TRANSISTOR_LABEL,
		labelAnchor: "start",
	},
	"pnp-transistor": {
		body: TRANSISTOR_BODY,
		paths: [...BIPOLAR_PATHS, "M-3 9 L6 9 L2 17 Z"],
		label: TRANSISTOR_LABEL,
		labelAnchor: "start",
	},
	"n-mosfet": {
		body: TRANSISTOR_BODY,
		paths: [...MOSFET_PATHS, "M12 10 H-2 M3 6 L-2 10 L3 14"],
		label: TRANSISTOR_LABEL,
		labelAnchor: "start",
	},
	"p-mosfet": {
		body: TRANSISTOR_BODY,
		paths: [...MOSFET_PATHS, "M-2 10 H12 M7 6 L12 10 L7 14"],
		label: TRANSISTOR_LABEL,
		labelAnchor: "start",
	},
	led: {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-10 M10 0 H40", "M-10 -10 V10 L10 0 Z", "M10 -10 V10", "M0 -12 L6 -20 M3 -20 H6 V-17 M6 -10 L12 -18 M9 -18 H12 V-15"],
		label: { x: 0, y: 26 },
		labelAnchor: "middle",
	},
	"switch-spdt": {
		body: { left: -40, top: -20, right: 40, bottom: 20 },
		paths: [
			"M-40 0 H-18 M40 -20 H18 M40 20 H18",
			"M-18 0 a2.5 2.5 0 1 0 0.1 0 M18 -20 a2.5 2.5 0 1 0 0.1 0 M18 20 a2.5 2.5 0 1 0 0.1 0",
		],
		label: { x: 0, y: -30 },
		labelAnchor: "middle",
	},
	"push-button": {
		body: TWO_PIN_BODY,
		paths: ["M-40 0 H-18 M18 0 H40", "M-18 0 a2.5 2.5 0 1 0 0.1 0 M18 0 a2.5 2.5 0 1 0 0.1 0"],
		label: { x: 0, y: -30 },
		labelAnchor: "middle",
	},
	"voltage-rail": {
		body: { left: -16, top: -10, right: 16, bottom: 40 },
		paths: ["M0 40 V8 M-12 8 H12", "M-6 0 L0 -8 L6 0"],
		label: { x: 0, y: -14 },
		labelAnchor: "middle",
	},
	"logic-input": { body: SOURCE_BOX_BODY, paths: [SOURCE_BOX], label: { x: 0, y: -20 }, labelAnchor: "middle" },
	"logic-output": {
		body: { left: -40, top: -16, right: 14, bottom: 16 },
		paths: ["M-40 0 H-14", "M-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0"],
		label: { x: 0, y: -20 },
		labelAnchor: "middle",
	},
	clock: { body: SOURCE_BOX_BODY, paths: [SOURCE_BOX, "M-12 6 H-6 V-6 H2 V6 H8 V-6"], label: { x: 0, y: -20 }, labelAnchor: "middle" },
	"not-gate": {
		body: { left: -40, top: -16, right: 40, bottom: 16 },
		paths: ["M-40 0 H-20 M24 0 H40", "M-20 -16 L16 0 L-20 16 Z", bubbleAt(16)],
		label: { x: 0, y: -22 },
		labelAnchor: "middle",
	},
	"and-gate": gateSymbol([AND_LEADS, AND_SHAPE, "M24 0 H40"]),
	"nand-gate": gateSymbol([AND_LEADS, AND_SHAPE, bubbleAt(24), "M32 0 H40"]),
	"or-gate": gateSymbol([OR_LEADS, OR_SHAPE, "M22 0 H40"]),
	"nor-gate": gateSymbol([OR_LEADS, OR_SHAPE, bubbleAt(22), "M30 0 H40"]),
	"xor-gate": gateSymbol([OR_LEADS, OR_SHAPE, XOR_EXTRA, "M22 0 H40"]),
	"xnor-gate": gateSymbol([OR_LEADS, OR_SHAPE, XOR_EXTRA, bubbleAt(22), "M30 0 H40"]),
	"and-gate-3": gateSymbol([AND_3_LEADS, AND_SHAPE, "M24 0 H40"]),
	"nand-gate-3": gateSymbol([AND_3_LEADS, AND_SHAPE, bubbleAt(24), "M32 0 H40"]),
	"or-gate-3": gateSymbol([OR_3_LEADS, OR_SHAPE, "M22 0 H40"]),
	"nor-gate-3": gateSymbol([OR_3_LEADS, OR_SHAPE, bubbleAt(22), "M30 0 H40"]),
	"and-gate-4": gate4Symbol([AND_4_LEADS, AND_4_SHAPE, "M48 0 H60"]),
	"nand-gate-4": gate4Symbol([AND_4_LEADS, AND_4_SHAPE, bubbleAt(48), "M56 0 H60"]),
	"or-gate-4": gate4Symbol([OR_4_LEADS, OR_4_SHAPE, "M46 0 H60"]),
	"nor-gate-4": gate4Symbol([OR_4_LEADS, OR_4_SHAPE, bubbleAt(46), "M54 0 H60"]),
	"sr-latch": boxSymbol([], [pinMark("S", -14, -20), pinMark("R", -14, 20), ...Q_MARKS]),
	"sr-latch-inverted": boxSymbol([], [pinMark("S̄", -14, -20), pinMark("R̄", -14, 20), ...Q_MARKS]),
	"d-flip-flop": boxSymbol([CLOCK_MARK(20)], [pinMark("D", -14, -20), ...Q_MARKS]),
	"t-flip-flop": boxSymbol([CLOCK_MARK(20)], [pinMark("T", -14, -20), ...Q_MARKS]),
	"jk-flip-flop": boxSymbol(["M-40 0 H-24", CLOCK_MARK(0)], [pinMark("J", -14, -20), pinMark("K", -14, 20), ...Q_MARKS]),
	"counter-4bit": {
		body: { left: -40, top: -48, right: 40, bottom: 32 },
		paths: ["M-24 -48 H24 V32 H-24 Z", "M-40 -20 H-24 M-40 20 H-24", "M24 -40 H40 M24 -20 H40 M24 0 H40 M24 20 H40", CLOCK_MARK(-20)],
		marks: [pinMark("R", -14, 20), pinMark("0", 14, -40), pinMark("1", 14, -20), pinMark("2", 14, 0), pinMark("3", 14, 20)],
		label: { x: 0, y: -54 },
		labelAnchor: "middle",
	},
	"scope-probe": {
		body: TWO_PIN_BODY,
		paths: [...METER_PATHS, "M-10 2 C-6 -10 -2 -10 0 0 C2 10 6 10 10 -2"],
		marks: [POSITIVE_LEAD_MARK],
		label: METER_LABEL,
		labelAnchor: "middle",
	},
	"op-amp": {
		body: { left: -40, top: -28, right: 40, bottom: 28 },
		paths: ["M-40 -20 H-20 M-40 20 H-20 M24 0 H40", "M-20 -28 L24 0 L-20 28 Z"],
		marks: [
			{ text: "−", at: { x: -12, y: -14 } },
			{ text: "+", at: { x: -12, y: 14 } },
		],
		label: { x: 0, y: -34 },
		labelAnchor: "middle",
	},
	"timer-555": {
		body: { left: -60, top: -60, right: 60, bottom: 60 },
		paths: [
			"M-36 -40 H36 V40 H-36 Z",
			"M0 -60 V-40 M0 60 V40 M-20 60 V40 M-60 20 H-36 M-60 0 H-36 M-60 -20 H-36 M60 0 H36 M60 -20 H36",
		],
		marks: [
			{ text: "555", at: { x: 0, y: 26 } },
			{ text: "V", at: { x: 0, y: -32 } },
			{ text: "tr", at: { x: -26, y: 20 } },
			{ text: "th", at: { x: -26, y: 0 } },
			{ text: "dis", at: { x: -24, y: -20 } },
			{ text: "out", at: { x: 22, y: 0 } },
			{ text: "rst", at: { x: 24, y: -20 } },
		],
		label: { x: 40, y: -46 },
		labelAnchor: "start",
	},
	"seven-segment-led": {
		body: { left: -40, top: -80, right: 40, bottom: 100 },
		paths: [leadsLeft([-70, -50, -30, -10, 10, 30, 50, 70]), "M-24 -80 H34 V80 H-24 Z", "M0 80 V100"],
		marks: [
			...["a", "b", "c", "d", "e", "f", "g", "·"].map((text, index) => ({ text, at: { x: -18, y: -70 + index * 20 } })),
			{ text: "com", at: { x: 12, y: 92 } },
		],
		label: { x: 0, y: -88 },
		labelAnchor: "middle",
	},
	"seven-segment": {
		body: { left: -40, top: -80, right: 40, bottom: 80 },
		paths: [leadsLeft([-70, -50, -30, -10, 10, 30, 50, 70]), "M-24 -80 H34 V80 H-24 Z"],
		marks: ["a", "b", "c", "d", "e", "f", "g", "·"].map((text, index) => ({ text, at: { x: -18, y: -70 + index * 20 } })),
		label: { x: 0, y: -88 },
		labelAnchor: "middle",
	},
	"bcd-to-seven-segment": {
		body: { left: -40, top: -70, right: 40, bottom: 70 },
		paths: [chipBox(-70, 70), leadsLeft([-30, -10, 10, 30]), leadsRight([-60, -40, -20, 0, 20, 40, 60])],
		marks: [
			...["1", "2", "4", "8"].map((text, index) => ({ text, at: { x: -16, y: -30 + index * 20 } })),
			...["a", "b", "c", "d", "e", "f", "g"].map((text, index) => ({ text, at: { x: 16, y: -60 + index * 20 } })),
		],
		label: { x: 0, y: -78 },
		labelAnchor: "middle",
	},
	"adc-4bit": {
		body: { left: -40, top: -40, right: 40, bottom: 40 },
		paths: [chipBox(-40, 40), leadsLeft([-20, 20]), leadsRight([-30, -10, 10, 30])],
		marks: [
			{ text: "in", at: { x: -13, y: -20 } },
			{ text: "ref", at: { x: -11, y: 20 } },
			...["1", "2", "4", "8"].map((text, index) => ({ text, at: { x: 16, y: -30 + index * 20 } })),
		],
		label: { x: 0, y: -48 },
		labelAnchor: "middle",
	},
	"dac-4bit": {
		body: { left: -40, top: -40, right: 40, bottom: 40 },
		paths: [chipBox(-40, 40), leadsLeft([-30, -10, 10, 30]), "M24 0 H40"],
		marks: [
			...["1", "2", "4", "8"].map((text, index) => ({ text, at: { x: -16, y: -30 + index * 20 } })),
			{ text: "ref", at: { x: 0, y: -30 } },
			{ text: "out", at: { x: 12, y: 0 } },
		],
		label: { x: 0, y: -48 },
		labelAnchor: "middle",
	},
	"adc-8bit": {
		body: { left: -40, top: -80, right: 40, bottom: 80 },
		paths: [chipBox(-80, 80), leadsLeft([-20, 20]), leadsRight(BYTE_YS)],
		marks: [
			{ text: "in", at: { x: -13, y: -20 } },
			{ text: "ref", at: { x: -11, y: 20 } },
			...BYTE_WEIGHTS.map((text, index) => ({ text, at: { x: 14, y: -70 + index * 20 } })),
		],
		label: { x: 0, y: -88 },
		labelAnchor: "middle",
	},
	"dac-8bit": {
		body: { left: -40, top: -80, right: 40, bottom: 80 },
		paths: [chipBox(-80, 80), leadsLeft(BYTE_YS), "M24 0 H40"],
		marks: [
			...BYTE_WEIGHTS.map((text, index) => ({ text, at: { x: -14, y: -70 + index * 20 } })),
			{ text: "ref", at: { x: 4, y: -68 } },
			{ text: "out", at: { x: 12, y: 0 } },
		],
		label: { x: 0, y: -88 },
		labelAnchor: "middle",
	},
	relay: {
		body: { left: -40, top: -30, right: 40, bottom: 30 },
		paths: [
			"M-40 -20 H-24 V-12 M-40 20 H-24 V12",
			"M-32 -12 H-16 V12 H-32 Z",
			"M-16 0 H8",
			"M40 0 H14 M40 -20 H18 M40 20 H18",
			"M14 0 a2.5 2.5 0 1 0 0.1 0 M18 -20 a2.5 2.5 0 1 0 0.1 0 M18 20 a2.5 2.5 0 1 0 0.1 0",
		],
		label: { x: 0, y: -36 },
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

/** The two-way switch's lever, from the common contact to the selected one. */
export const spdtLeverPath = (position: "a" | "b") => (position === "a" ? "M-16 -1 L16 -18" : "M-16 1 L16 18")

/** The potentiometer's track runs from x = −24 (position 0, end a) to 24 (position 1, end b); the arrow tip touches it. */
export const WIPER_TRACK = { start: -24, length: 48, tipY: -11 }
/** The wiper: down from its pin, across to its position on the track, ending in an arrow. */
export function potentiometerWiper(position: number): { d: string; x: number; y: number } {
	const x = WIPER_TRACK.start + WIPER_TRACK.length * position
	return { d: `M0 -40 V-26 H${x} V-12 M${x - 5} -18 L${x} ${WIPER_TRACK.tipY} L${x + 5} -18`, x, y: WIPER_TRACK.tipY - 6 }
}

/** Each capacitor plate, by the pin it belongs to, so it can be coloured with that pin's voltage. */
export const CAPACITOR_PLATES: Partial<Record<ComponentType, { pin: string; d: string }[]>> = {
	capacitor: [
		{ pin: "a", d: "M-5 -14 V14" },
		{ pin: "b", d: "M5 -14 V14" },
	],
	"polarized-capacitor": [
		{ pin: "positive", d: "M-5 -14 V14" },
		{ pin: "negative", d: "M9 -14 Q1 0 9 14" },
	],
}

/** A relay's contact arm: from common to normally open when pulled in, else to normally closed. */
export const relayLeverPath = (pulledIn: boolean) => (pulledIn ? "M14 0 L18 -18" : "M14 0 L18 18")

/** A plunger bar that touches both contacts while the button conducts. */
export const pushButtonPath = (conducting: boolean) => (conducting ? "M-18 -3 H18 M0 -3 V-16" : "M-18 -11 H18 M0 -11 V-24")

export const PART_NAMES: { [Type in ComponentType]: string } = {
	ground: "Ground",
	"voltage-source": "Voltage source",
	"current-source": "Current source",
	"ac-source": "AC source",
	"square-source": "Square wave",
	vcvs: "VCVS",
	vccs: "VCCS",
	ccvs: "CCVS",
	cccs: "CCCS",
	"polarized-capacitor": "Polarized capacitor",
	potentiometer: "Potentiometer",
	lamp: "Lamp",
	transformer: "Transformer",
	"tapped-transformer": "Centre-tapped transformer",
	"switch-spdt": "Two-way switch",
	resistor: "Resistor",
	junction: "Junction",
	capacitor: "Capacitor",
	inductor: "Inductor",
	switch: "Switch",
	"push-button": "Push button",
	diode: "Diode",
	"zener-diode": "Zener diode",
	led: "LED",
	"rgb-led": "RGB LED",
	"npn-transistor": "NPN transistor",
	"pnp-transistor": "PNP transistor",
	"n-mosfet": "N-MOSFET",
	"p-mosfet": "P-MOSFET",
	"voltage-rail": "Voltage rail",
	"logic-input": "Logic input",
	"logic-output": "Logic output",
	clock: "Clock",
	"not-gate": "NOT",
	"and-gate": "AND",
	"or-gate": "OR",
	"nand-gate": "NAND",
	"nor-gate": "NOR",
	"xor-gate": "XOR",
	"xnor-gate": "XNOR",
	"and-gate-3": "AND (3 inputs)",
	"and-gate-4": "AND (4 inputs)",
	"or-gate-3": "OR (3 inputs)",
	"or-gate-4": "OR (4 inputs)",
	"nand-gate-3": "NAND (3 inputs)",
	"nand-gate-4": "NAND (4 inputs)",
	"nor-gate-3": "NOR (3 inputs)",
	"nor-gate-4": "NOR (4 inputs)",
	"sr-latch": "SR latch",
	"sr-latch-inverted": "S̄R̄ latch",
	"d-flip-flop": "D flip-flop",
	"t-flip-flop": "T flip-flop",
	"jk-flip-flop": "JK flip-flop",
	"counter-4bit": "4-bit counter",
	"op-amp": "Op-amp",
	"timer-555": "555 timer",
	"scope-probe": "Scope probe",
	"seven-segment": "7-segment display",
	"seven-segment-led": "LED 7-segment",
	"bcd-to-seven-segment": "BCD to 7-segment",
	"adc-4bit": "4-bit ADC",
	"dac-4bit": "4-bit DAC",
	"adc-8bit": "8-bit ADC",
	"dac-8bit": "8-bit DAC",
	relay: "Relay",
	voltmeter: "Voltmeter",
	ammeter: "Ammeter",
	ohmmeter: "Ohmmeter",
}
