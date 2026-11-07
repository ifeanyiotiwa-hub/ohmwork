import type { Component, ComponentType } from "../schema/components/catalog"
import type { Point } from "../schema/geometry"

/**
 * Where each pin sits relative to the part's position, at rotation 0. Screen coordinates: x right, y down.
 * Shared by the app (drawing) and the MCP server (so an agent can lay parts out neatly).
 */
const LEADS = { a: { x: -40, y: 0 }, b: { x: 40, y: 0 } }
const POLARISED_LEADS = { positive: { x: -40, y: 0 }, negative: { x: 40, y: 0 } }
const TRANSISTOR_LEADS = { collector: { x: 20, y: -40 }, base: { x: -40, y: 0 }, emitter: { x: 20, y: 40 } }
const MOSFET_LEADS = { drain: { x: 20, y: -40 }, gate: { x: -40, y: 0 }, source: { x: 20, y: 40 } }
const GATE_LEADS = { a: { x: -40, y: -20 }, b: { x: -40, y: 20 }, out: { x: 40, y: 0 } }
const TWO_IN_TWO_OUT = (first: string, second: string) => ({
	[first]: { x: -40, y: -20 },
	[second]: { x: -40, y: 20 },
	q: { x: 40, y: -20 },
	qNot: { x: 40, y: 20 },
})
/** Four-pin controlled sources: control or sense pins on the left, output on the right. */
const CONTROLLED_LEADS = {
	controlPositive: { x: -40, y: -20 },
	controlNegative: { x: -40, y: 20 },
	positive: { x: 40, y: -20 },
	negative: { x: 40, y: 20 },
}
const SENSED_LEADS = {
	senseIn: { x: -40, y: -20 },
	senseOut: { x: -40, y: 20 },
	positive: { x: 40, y: -20 },
	negative: { x: 40, y: 20 },
}

export const PIN_OFFSETS: { [Type in ComponentType]: Record<string, Point> } = {
	ground: { terminal: { x: 0, y: -20 } },
	"voltage-source": POLARISED_LEADS,
	"current-source": POLARISED_LEADS,
	"ac-source": POLARISED_LEADS,
	"square-source": POLARISED_LEADS,
	vcvs: CONTROLLED_LEADS,
	vccs: CONTROLLED_LEADS,
	ccvs: SENSED_LEADS,
	cccs: SENSED_LEADS,
	"polarized-capacitor": POLARISED_LEADS,
	potentiometer: { a: { x: -40, y: 0 }, b: { x: 40, y: 0 }, wiper: { x: 0, y: -40 } },
	lamp: LEADS,
	transformer: {
		primaryA: { x: -40, y: -40 },
		primaryB: { x: -40, y: 40 },
		secondaryA: { x: 40, y: -40 },
		secondaryB: { x: 40, y: 40 },
	},
	"switch-spdt": { common: { x: -40, y: 0 }, a: { x: 40, y: -20 }, b: { x: 40, y: 20 } },
	resistor: LEADS,
	capacitor: LEADS,
	inductor: LEADS,
	switch: LEADS,
	"push-button": LEADS,
	diode: { anode: { x: -40, y: 0 }, cathode: { x: 40, y: 0 } },
	led: { anode: { x: -40, y: 0 }, cathode: { x: 40, y: 0 } },
	"zener-diode": { anode: { x: -40, y: 0 }, cathode: { x: 40, y: 0 } },
	"rgb-led": { red: { x: -40, y: -20 }, green: { x: -40, y: 0 }, blue: { x: -40, y: 20 }, common: { x: 40, y: 0 } },
	// Transistors: base or gate on the left, collector or drain up, emitter or source down (as drawn in textbooks).
	"npn-transistor": TRANSISTOR_LEADS,
	"pnp-transistor": TRANSISTOR_LEADS,
	"n-mosfet": MOSFET_LEADS,
	"p-mosfet": MOSFET_LEADS,
	"voltage-rail": { terminal: { x: 0, y: 40 } },
	"scope-probe": POLARISED_LEADS,
	"op-amp": { nonInverting: { x: -40, y: 20 }, inverting: { x: -40, y: -20 }, output: { x: 40, y: 0 } },
	// 555 laid out as usually drawn: vcc on top, ground below, inputs left, output and reset right.
	"timer-555": {
		vcc: { x: 0, y: -60 },
		ground: { x: 0, y: 60 },
		trigger: { x: -60, y: 20 },
		threshold: { x: -60, y: 0 },
		discharge: { x: -60, y: -20 },
		control: { x: -20, y: 60 },
		output: { x: 60, y: 0 },
		reset: { x: 60, y: -20 },
	},
	"logic-input": { out: { x: 40, y: 0 } },
	"logic-output": { in: { x: -40, y: 0 } },
	clock: { out: { x: 40, y: 0 } },
	"not-gate": { in: { x: -40, y: 0 }, out: { x: 40, y: 0 } },
	"and-gate": GATE_LEADS,
	"or-gate": GATE_LEADS,
	"nand-gate": GATE_LEADS,
	"nor-gate": GATE_LEADS,
	"xor-gate": GATE_LEADS,
	"xnor-gate": GATE_LEADS,
	"sr-latch": TWO_IN_TWO_OUT("s", "r"),
	"sr-latch-inverted": TWO_IN_TWO_OUT("sNot", "rNot"),
	"d-flip-flop": TWO_IN_TWO_OUT("d", "clk"),
	"t-flip-flop": TWO_IN_TWO_OUT("t", "clk"),
	"jk-flip-flop": { j: { x: -40, y: -20 }, clk: { x: -40, y: 0 }, k: { x: -40, y: 20 }, q: { x: 40, y: -20 }, qNot: { x: 40, y: 20 } },
	"counter-4bit": {
		clk: { x: -40, y: -20 },
		reset: { x: -40, y: 20 },
		q0: { x: 40, y: -40 },
		q1: { x: 40, y: -20 },
		q2: { x: 40, y: 0 },
		q3: { x: 40, y: 20 },
	},
	voltmeter: POLARISED_LEADS,
	ammeter: POLARISED_LEADS,
	ohmmeter: LEADS,
}

/** Turns a point clockwise on screen by the part's rotation. */
export function rotate({ x, y }: Point, degrees: Component["rotation"]): Point {
	switch (degrees) {
		case 0:
			return { x, y }
		case 90:
			return { x: -y, y: x }
		case 180:
			return { x: -x, y: -y }
		case 270:
			return { x: y, y: -x }
	}
}

export function pinPosition(component: Component, pin: string, at: Point = component.position): Point {
	const local = PIN_OFFSETS[component.type][pin] ?? { x: 0, y: 0 }
	const turned = rotate(local, component.rotation)
	return { x: at.x + turned.x, y: at.y + turned.y }
}

/** The unit direction a pin points, away from its part: along the offset's longer axis (x on a tie). */
export function pinDirection(component: Component, pin: string): Point {
	const turned = rotate(PIN_OFFSETS[component.type][pin] ?? { x: 0, y: 0 }, component.rotation)
	return Math.abs(turned.x) >= Math.abs(turned.y)
		? { x: Math.sign(turned.x) || 0, y: 0 }
		: { x: 0, y: Math.sign(turned.y) || 0 }
}
