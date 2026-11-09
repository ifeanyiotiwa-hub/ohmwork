import type { Circuit } from "@engineering-circuit/format"
import { type DcInputs, STATEFUL_TYPES, type StoredState, TIME_DEPENDENT_TYPES } from "../dc/branches"
import type { SimIssue } from "../dc/issues"
import { type DcSolution, solveCircuit } from "../dc/solve-dc"
import { type LogicMemories, advanceLogic, initialMemories } from "../digital/advance"

/**
 * Simulated time, each capacitor's / inductor's state (keyed by component id), and the last pin voltages, which
 * start the next step's Newton–Raphson. Starts empty: all at rest.
 */
export type TransientState = {
	time: number
	memory: Readonly<Record<string, StoredState>>
	pinVoltages: Readonly<Record<string, number>>
	/** Logic parts' state and outputs; the outputs drive the next step (one step of propagation delay). */
	logic?: LogicMemories
	/** What was switched on or off in the last step; a change starts a run of backward-Euler steps. */
	switching?: string
	/** Backward-Euler steps still to take after the last switch. */
	settling?: number
}

/**
 * Steps of backward Euler after anything switches. With a fixed step, the trapezoidal rule makes a fast decay
 * (time constant below half a step) flip sign every step; backward Euler damps it without ringing. SPICE takes one
 * such step and then shrinks the step size; we hold it for a few steps instead (each divides a fast transient by
 * 1 + Δt/τ, so ten leave nothing visible).
 */
const SETTLING_STEPS = 10
export type TransientOptions = DcInputs & { timeStep: number }
export type TransientResult = { ok: true; state: TransientState; solution: DcSolution } | { ok: false; errors: SimIssue[] }

export const initialTransientState = (): TransientState => ({ time: 0, memory: {}, pinVoltages: {} })

export const isTimeDependent = (circuit: Circuit): boolean =>
	circuit.components.some((component) => TIME_DEPENDENT_TYPES.has(component.type))

/**
 * Advances the circuit by one time step. The circuit may change between steps (an edit, a switch flip): stored
 * states are matched by component id, so a capacitor keeps its charge when the parts around it change.
 */
export function stepTransient(circuit: Circuit, previous: TransientState, { timeStep, pressed }: TransientOptions): TransientResult {
	const time = previous.time + timeStep
	const logicNow = previous.logic ?? initialMemories(circuit)
	const switching = switchingOf(circuit, pressed, logicNow)
	const switched = previous.switching !== undefined && previous.switching !== switching
	const settling = switched ? SETTLING_STEPS : Math.max(0, (previous.settling ?? 0) - 1)
	const result = solveCircuit(circuit, {
		...(pressed ? { pressed } : {}),
		transient: {
			time,
			timeStep,
			memory: previous.memory,
			backwardEuler: settling > 0,
		},
		guess: previous.pinVoltages,
		logic: logicNow,
	})
	if (!result.ok) return result

	const stateful = new Set(circuit.components.filter((component) => STATEFUL_TYPES.has(component.type)).map((part) => part.id))
	const memory = Object.fromEntries(
		[...Object.entries(result.solution.readings), ...Object.entries(result.solution.ports), ...Object.entries(result.solution.internal ?? {})]
			.filter(([key]) => stateful.has(key.split("/")[0] ?? ""))
			.map(([key, reading]): [string, StoredState] => [key, { voltage: reading.voltage, current: reading.current }]),
	)
	const logic = advanceLogic(circuit, result.solution, logicNow, circuit.simulation.logicHigh)
	return {
		ok: true,
		state: { time, memory, pinVoltages: result.solution.pinVoltages, logic, switching, settling },
		solution: result.solution,
	}
}

/** Everything that switches abruptly: switch positions, buttons held, relay contacts and logic outputs. */
function switchingOf(circuit: Circuit, pressed: ReadonlySet<string> | undefined, logic: LogicMemories): string {
	const positions = circuit.components.flatMap((component) => {
		switch (component.type) {
			case "switch":
				return [`${component.id}:${component.params.closed}`]
			case "push-button":
				return [`${component.id}:${pressed?.has(component.id) ?? false}`]
			case "switch-spdt":
				return [`${component.id}:${component.params.position}`]
			default:
				return []
		}
	})
	const outputs = Object.entries(logic).map(([id, memory]) => `${id}:${memory.outputs.map((bit) => (bit ? 1 : 0)).join("")}`)
	return [...positions, ...outputs].join("|")
}
