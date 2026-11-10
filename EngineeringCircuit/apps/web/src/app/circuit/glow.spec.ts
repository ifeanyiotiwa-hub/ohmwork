import type { DcSolution } from "@ohmwork/engine"
import { COMPONENT_DEFINITIONS, type Component } from "@ohmwork/format"
import { expect, test } from "vitest"
import { glowOf } from "./glow"

const at = { position: { x: 0, y: 0 }, rotation: 0 } as const
const LED = { saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 }
const solution = (readings: DcSolution["readings"], ports: DcSolution["ports"] = {}): DcSolution => ({
	pinVoltages: {},
	readings,
	ports,
	warnings: [],
})

test("an LED glows in its colour with current over its full-brightness current", () => {
	const led = { ...at, id: "LED1", type: "led", params: { color: "green", ...LED } } as Component
	expect(glowOf(led, solution({ LED1: { voltage: 2, current: 0.005 } }), 5)).toEqual({ colour: "rgb(77 255 136)", strength: 0.5 })
	expect(glowOf(led, solution({ LED1: { voltage: 2, current: 0.05 } }), 5)?.strength).toBe(1)
	expect(glowOf(led, solution({ LED1: { voltage: -5, current: -1e-12 } }), 5)?.strength).toBe(0)
})

test("an RGB LED mixes its colours by current", () => {
	const defaults = COMPONENT_DEFINITIONS.find((definition) => definition.type === "rgb-led")?.defaults
	const rgbLed = { ...at, id: "RGB1", type: "rgb-led", params: { ...defaults, commonCathode: true } } as Component
	const glow = glowOf(rgbLed, solution({}, { "RGB1/red": { voltage: 2, current: 0.01 }, "RGB1/blue": { voltage: 2, current: 0.005 } }), 5)
	expect(glow).toEqual({ colour: "rgb(255 0 128)", strength: 1 })
})

test("a lamp glows with its share of rated power; a resistor never glows", () => {
	const lamp = { ...at, id: "L1", type: "lamp", params: { ratedVoltage: 6, ratedPower: 1 } } as Component
	expect(glowOf(lamp, solution({ L1: { voltage: 3, current: 1 / 12 } }), 5)?.strength).toBeCloseTo(0.25, 12)
	expect(glowOf({ ...at, id: "R1", type: "resistor", params: { resistance: 1, powerRating: 0.25 } }, undefined, 5)).toBeUndefined()
})

test("a logic indicator lights above half the logic level", () => {
	const indicator = { ...at, id: "OUT1", type: "logic-output", params: {} } as Component
	const at3 = { pinVoltages: { "OUT1:in": 3 }, readings: {}, ports: {}, warnings: [] }
	expect(glowOf(indicator, at3, 5)?.strength).toBe(1)
	expect(glowOf(indicator, at3, 9)?.strength).toBe(0)
})
