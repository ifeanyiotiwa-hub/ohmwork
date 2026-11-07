import type { Circuit } from "@engineering-circuit/format"
import { type DcInputs, STATEFUL_TYPES, type StoredState, TIME_DEPENDENT_TYPES } from "../dc/branches"
import type { SimIssue } from "../dc/issues"
import { type DcSolution, solveCircuit } from "../dc/solve-dc"

/** Simulated time and each capacitor's / inductor's state, keyed by component id. Starts empty: all at rest. */
export type TransientState = { time: number; memory: Readonly<Record<string, StoredState>> }
export type TransientOptions = DcInputs & { timeStep: number }
export type TransientResult = { ok: true; state: TransientState; solution: DcSolution } | { ok: false; errors: SimIssue[] }

export const initialTransientState = (): TransientState => ({ time: 0, memory: {} })

export const isTimeDependent = (circuit: Circuit): boolean =>
	circuit.components.some((component) => TIME_DEPENDENT_TYPES.has(component.type))

/**
 * Advances the circuit by one time step. The circuit may change between steps (an edit, a switch flip): stored
 * states are matched by component id, so a capacitor keeps its charge when the parts around it change.
 */
export function stepTransient(circuit: Circuit, previous: TransientState, { timeStep, pressed }: TransientOptions): TransientResult {
	const time = previous.time + timeStep
	const result = solveCircuit(circuit, {
		...(pressed ? { pressed } : {}),
		transient: { time, timeStep, memory: previous.memory },
	})
	if (!result.ok) return result

	const stateful = new Set(circuit.components.filter((component) => STATEFUL_TYPES.has(component.type)).map((part) => part.id))
	const memory = Object.fromEntries(
		[...Object.entries(result.solution.readings), ...Object.entries(result.solution.ports)]
			.filter(([key]) => stateful.has(key.split("/")[0] ?? ""))
			.map(([key, reading]): [string, StoredState] => [key, { voltage: reading.voltage, current: reading.current }]),
	)
	return { ok: true, state: { time, memory }, solution: result.solution }
}
