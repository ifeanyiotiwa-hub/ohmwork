// Parts that turn analog values into stored state (or back) once per step: CircuitJS1 ADCElm / DACElm and RelayElm.
import type { LogicMemory } from "./logic"
import type { Sequential } from "./sequential"

const BITS = 4
const MAX_CODE = (1 << BITS) - 1
const DATA_PINS = ["d0", "d1", "d2", "d3"] as const
const bitsOf = (code: number) => DATA_PINS.map((_, index) => ((code >> index) & 1) === 1)
const AT_REST: LogicMemory = { outputs: bitsOf(0), state: { value: 0, clock: false } }

/** Truncates 15 × Vin / Vref to 0–15 (no rounding, as CircuitJS1: rounding would break a half-flash converter). */
export const ADC_4BIT: Sequential = {
	initial: () => AT_REST,
	next: (_memory, readings) => {
		const reference = readings.voltage("vref")
		const code = reference > 0 ? Math.min(MAX_CODE, Math.max(0, Math.trunc((MAX_CODE * readings.voltage("in")) / reference))) : 0
		return { outputs: bitsOf(code), state: { value: code, clock: false } }
	},
}

/** Reads its data pins as a code; the analog output (code × Vref / 15) is a controlled source in dc/branches.ts. */
export const DAC_4BIT: Sequential = {
	initial: () => AT_REST,
	next: (_memory, readings, logicHigh) => {
		const code = DATA_PINS.reduce((sum, pin, index) => sum + (readings.voltage(pin) > logicHigh / 2 ? 1 << index : 0), 0)
		return { outputs: bitsOf(code), state: { value: code, clock: false } }
	},
}

export const DAC_MAX_CODE = MAX_CODE

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
