// Parts that turn analog values into stored state (or back) once per step: CircuitJS1 ADCElm / DACElm and RelayElm.
import type { LogicMemory } from "./logic"
import type { Sequential } from "./sequential"

/** A converter's data pins d0…d(n−1) and its largest code, 2ⁿ − 1. */
export type Converter = { pins: readonly string[]; maxCode: number }

const converter = (bits: number): Converter => ({
	pins: Array.from({ length: bits }, (_, index) => `d${index}`),
	maxCode: (1 << bits) - 1,
})
export const CONVERTER_4BIT = converter(4)
export const CONVERTER_8BIT = converter(8)

const bitsOf = ({ pins }: Converter, code: number) => pins.map((_, index) => ((code >> index) & 1) === 1)
const atRest = (shape: Converter): LogicMemory => ({ outputs: bitsOf(shape, 0), state: { value: 0, clock: false } })

/** Truncates maxCode × Vin / Vref to 0…maxCode (no rounding, as CircuitJS1: rounding would break a half-flash converter). */
export const adc = (shape: Converter): Sequential => ({
	initial: () => atRest(shape),
	next: (_memory, readings) => {
		const reference = readings.voltage("vref")
		const scaled = Math.trunc((shape.maxCode * readings.voltage("in")) / reference)
		const code = reference > 0 ? Math.min(shape.maxCode, Math.max(0, scaled)) : 0
		return { outputs: bitsOf(shape, code), state: { value: code, clock: false } }
	},
})

/** Reads its data pins as a code; the analog output (code × Vref / maxCode) is a controlled source in dc/branches.ts. */
export const dac = (shape: Converter): Sequential => ({
	initial: () => atRest(shape),
	next: (_memory, readings, logicHigh) => {
		const code = shape.pins.reduce((sum, pin, index) => sum + (readings.voltage(pin) > logicHigh / 2 ? 1 << index : 0), 0)
		return { outputs: bitsOf(shape, code), state: { value: code, clock: false } }
	},
})

export const ADC_4BIT = adc(CONVERTER_4BIT)
export const DAC_4BIT = dac(CONVERTER_4BIT)
export const ADC_8BIT = adc(CONVERTER_8BIT)
export const DAC_8BIT = dac(CONVERTER_8BIT)

/** outputs[0]: pulled in. Above onCurrent it pulls in, below offCurrent it drops out; in between it stays. */
export const RELAY: Sequential = {
	initial: () => ({ outputs: [false], state: { value: 0, clock: false } }),
	next: (memory, readings, _logicHigh, params) => {
		const current = Math.abs(readings.current("coil"))
		const onCurrent = Number(params["onCurrent"])
		const offCurrent = Math.min(Number(params["offCurrent"]), onCurrent)
		const wasIn = memory.outputs[0] ?? false
		const pulledIn = wasIn ? current >= offCurrent : current > onCurrent
		return { outputs: [pulledIn], state: memory.state }
	},
}

/**
 * outputs[0]: the level it passes on, outputs[1]: enabled. Read like a gate's inputs (1 above half of logic high), with
 * a gate's one step of delay; the output (driving, or let go) is in dc/branches.ts.
 */
export const TRI_STATE: Sequential = {
	initial: () => ({ outputs: [false, false], state: { value: 0, clock: false } }),
	next: (memory, readings, logicHigh) => ({
		outputs: [readings.voltage("in") > logicHigh / 2, readings.voltage("enable") > logicHigh / 2],
		state: memory.state,
	}),
}
