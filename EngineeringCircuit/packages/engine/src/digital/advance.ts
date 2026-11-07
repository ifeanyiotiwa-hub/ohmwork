import { type Circuit, pinKey } from "@engineering-circuit/format"
import type { LogicMemory } from "./logic"
import { sequentialOf } from "./sequential"

/** Every logic part's memory, keyed by component id. */
export type LogicMemories = Readonly<Record<string, LogicMemory>>

export const hasLogic = (circuit: Circuit) => circuit.components.some((component) => sequentialOf(component.type))

export function initialMemories(circuit: Circuit): LogicMemories {
	return Object.fromEntries(
		circuit.components.flatMap((component) => {
			const part = sequentialOf(component.type)
			return part ? [[component.id, part.initial()]] : []
		}),
	)
}

/**
 * Reads each sequential part's pins after a solve and steps it. The new outputs drive the next solve, so every
 * such part has one solve (one time step) of delay.
 */
export function advanceLogic(
	circuit: Circuit,
	pinVoltages: Readonly<Record<string, number>>,
	previous: LogicMemories,
	logicHigh: number,
): LogicMemories {
	return Object.fromEntries(
		circuit.components.flatMap((component) => {
			const part = sequentialOf(component.type)
			if (!part) return []
			const voltageOf = (pin: string) => pinVoltages[pinKey({ componentId: component.id, pin })] ?? 0
			return [[component.id, part.next(previous[component.id] ?? part.initial(), voltageOf, logicHigh)]]
		}),
	)
}

export const sameOutputs = (first: LogicMemories, second: LogicMemories) =>
	Object.entries(first).every(([id, memory]) => memory.outputs.every((bit, index) => second[id]?.outputs[index] === bit))
