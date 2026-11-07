import type { ComponentType } from "@engineering-circuit/format"
import { type LogicMemory, type LogicPart, initialMemory, logicPartOf } from "./logic"
import { TIMER_555 } from "./timer-555"

/**
 * A part whose outputs depend on what it remembers: logic gates and flip-flops, and the 555's latch. After each
 * solve it reads its pins and returns its memory for the next solve (one solve, one time step, of delay).
 */
export type Sequential = {
	initial(): LogicMemory
	next(memory: LogicMemory, voltageOf: (pin: string) => number, logicHigh: number): LogicMemory
}

/** Logic parts read each input as 1 above half the logic level (CircuitJS1 getThreshold). */
const fromLogic = (part: LogicPart): Sequential => ({
	initial: () => initialMemory(part),
	next: (memory, voltageOf, logicHigh) => {
		const bits = part.inputs.map((pin) => voltageOf(pin) > logicHigh / 2)
		const { outputs, state } = part.step(bits, memory.state)
		return { outputs, state }
	},
})

export function sequentialOf(type: ComponentType): Sequential | undefined {
	if (type === "timer-555") return TIMER_555
	const part = logicPartOf(type)
	return part ? fromLogic(part) : undefined
}
