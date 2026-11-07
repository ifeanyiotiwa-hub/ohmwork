import type { Component } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { meterText, valueText } from "./part-text"

const at = { position: { x: 0, y: 0 }, rotation: 0 } as const
const part = (component: Pick<Component, "id" | "type" | "params">) => ({ ...at, ...component }) as Component

test("parameters read in their own words", () => {
	expect(valueText(part({ id: "R1", type: "resistor", params: { resistance: 4700 } }))).toBe("4.7 kΩ")
	expect(valueText(part({ id: "S1", type: "switch", params: { closed: false } }))).toBe("open")
	expect(valueText(part({ id: "PB1", type: "push-button", params: { normallyOpen: true } }))).toBe("NO")
	expect(valueText(part({ id: "PB2", type: "push-button", params: { normallyOpen: false } }))).toBe("NC")
})

test("wave sources read compactly: peak and frequency, or low–high and frequency", () => {
	const ac = part({ id: "AC1", type: "ac-source", params: { amplitude: 5, frequency: 40, offset: 0, phase: 0, delay: 0 } })
	expect(valueText(ac)).toBe("5 V 40 Hz")
	expect(valueText({ ...ac, params: { ...ac.params, offset: 1 } } as Component)).toBe("5 V 40 Hz +1 V")
	expect(valueText(part({ id: "SQ1", type: "square-source", params: { low: 0, high: 5, frequency: 1000, dutyCycle: 0.5 } }))).toBe(
		"0 V–5 V 1 kHz",
	)
})

test("a transformer reads as its primary inductance and turns ratio", () => {
	expect(valueText(part({ id: "T1", type: "transformer", params: { primaryInductance: 4, turnsRatio: 2, coupling: 0.999 } }))).toBe(
		"4 H 1:2",
	)
})

test("meters show what they measure", () => {
	const reading = { voltage: 4, current: -0.002, resistance: 1500 }
	expect(meterText(part({ id: "VM1", type: "voltmeter", params: {} }), reading)).toBe("4 V")
	expect(meterText(part({ id: "AM1", type: "ammeter", params: {} }), reading)).toBe("-2 mA")
	expect(meterText(part({ id: "OM1", type: "ohmmeter", params: {} }), reading)).toBe("1.5 kΩ")
	expect(meterText(part({ id: "OM1", type: "ohmmeter", params: {} }), { ...reading, resistance: Infinity })).toBe("OL (open)")
	expect(meterText(part({ id: "R1", type: "resistor", params: { resistance: 1 } }), reading)).toBeUndefined()
})

test("a meter with no reading (the circuit can't be solved) shows a dash", () => {
	expect(meterText(part({ id: "VM1", type: "voltmeter", params: {} }), undefined)).toBe("–")
})
