import { type Circuit, pinKey } from "@engineering-circuit/format"
import { type LogicMemory, initialMemory, logicPartOf } from "./logic"

/** Every logic part's memory, keyed by component id. */
export type LogicMemories = Readonly<Record<string, LogicMemory>>

export const hasLogic = (circuit: Circuit) => circuit.components.some((component) => logicPartOf(component.type))

export function initialMemories(circuit: Circuit): LogicMemories {
	return Object.fromEntries(
		circuit.components.flatMap((component) => {
			const part = logicPartOf(component.type)
			return part ? [[component.id, initialMemory(part)]] : []
		}),
	)
}

/**
 * Reads each logic part's input pins (1 above half the logic level, as CircuitJS1) and steps it. The new outputs
 * drive the next solve, so every logic part has one solve (one time step) of delay.
 */
export function advanceLogic(
	circuit: Circuit,
	pinVoltages: Readonly<Record<string, number>>,
	previous: LogicMemories,
	logicHigh: number,
): LogicMemories {
	const threshold = logicHigh / 2
	return Object.fromEntries(
		circuit.components.flatMap((component) => {
			const part = logicPartOf(component.type)
			if (!part) return []
			const memory = previous[component.id] ?? initialMemory(part)
			const bits = part.inputs.map((pin) => (pinVoltages[pinKey({ componentId: component.id, pin })] ?? 0) > threshold)
			const { outputs, state } = part.step(bits, memory.state)
			return [[component.id, { state, outputs }]]
		}),
	)
}

export const sameOutputs = (first: LogicMemories, second: LogicMemories) =>
	Object.entries(first).every(([id, memory]) => memory.outputs.every((bit, index) => second[id]?.outputs[index] === bit))
