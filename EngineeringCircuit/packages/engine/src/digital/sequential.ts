import type { ComponentType } from "@engineering-circuit/format"
import { type LogicMemory, type LogicPart, initialMemory, logicPartOf } from "./logic"
import { ADC_4BIT, ADC_8BIT, DAC_4BIT, DAC_8BIT, RELAY } from "./mixed-parts"
import { TIMER_555 } from "./timer-555"

/** What a sequential part can read after a solve: its pin voltages and its ports' currents (a relay's coil). */
export type PartReadings = { voltage(pin: string): number; current(port: string): number }

/**
 * A part whose outputs depend on what it remembers: logic gates and flip-flops, the 555's latch, converters and a
 * relay's contacts. After each solve it reads its pins and returns its memory for the next solve (one solve, one
 * time step, of delay).
 */
export type Sequential = {
	initial(): LogicMemory
	next(memory: LogicMemory, readings: PartReadings, logicHigh: number, params: Record<string, unknown>): LogicMemory
}

/** Logic parts read each input as 1 above half the logic level (CircuitJS1 getThreshold). */
const fromLogic = (part: LogicPart): Sequential => ({
	initial: () => initialMemory(part),
	next: (memory, readings, logicHigh) => {
		const bits = part.inputs.map((pin) => readings.voltage(pin) > logicHigh / 2)
		const { outputs, state } = part.step(bits, memory.state)
		return { outputs, state }
	},
})

const SPECIAL: Partial<Record<ComponentType, Sequential>> = {
	"timer-555": TIMER_555,
	"adc-4bit": ADC_4BIT,
	"dac-4bit": DAC_4BIT,
	"adc-8bit": ADC_8BIT,
	"dac-8bit": DAC_8BIT,
	relay: RELAY,
}

export function sequentialOf(type: ComponentType): Sequential | undefined {
	const special = SPECIAL[type]
	if (special) return special
	const part = logicPartOf(type)
	return part ? fromLogic(part) : undefined
}
