// Moving a circuit on in time with the step size chosen as it goes (adaptive stepping). Each step is taken once at
// size h and again as two steps of h/2; the difference estimates the local error (Richardson extrapolation: a
// second-order method's error is about a third of it). A step whose error is within SPICE's usual tolerances is kept
// (the two half steps, the more accurate answer) and the next step grows; otherwise it is taken again, smaller.
// Steps never cross a square wave's edge (a breakpoint, as in SPICE), and never exceed the circuit's time step.
import { type Circuit, type ComponentType, expandSubcircuits } from "@ohmwork/format"
import type { DcInputs, StoredState } from "../dc/branches"
import type { SimIssue } from "../dc/issues"
import type { DcSolution } from "../dc/solve-dc"
import { sequentialOf } from "../digital/sequential"
import { type TransientState, stepTransient } from "./step"

/** SPICE's RELTOL, VNTOL and a current tolerance suited to a learner's circuits (amps). */
const RELATIVE_TOLERANCE = 1e-3
const VOLTAGE_TOLERANCE = 1e-6
const CURRENT_TOLERANCE = 1e-9
/** The next step is at most this many times the last, and a retry at least this fraction of it. */
const GROWTH = 2
const SHRINK = 0.2
const SAFETY = 0.9
/** Steps are never smaller than this fraction of the largest step: a circuit that can't meet the tolerance moves on. */
const SMALLEST_STEP = 1e-9

export type AdvanceOptions = DcInputs & {
	/** The largest step (the circuit's time step). */
	maxStep: number
	/** Where the last advance left the step size, to carry on from. */
	initialStep?: number
	/** Called after each kept step. */
	onStep?: (state: TransientState, solution: DcSolution) => void
	/** Stop after this many kept steps (the app's frame budget), even before `until`. */
	maxSteps?: number
	/** Times a step must land on exactly, like edges (an agent's sample times). */
	landOn?: readonly number[]
}
export type AdvanceResult =
	| { ok: true; state: TransientState; solution: DcSolution; steps: number; nextStep: number; reachedUntil: boolean }
	| { ok: false; errors: SimIssue[] }

/** Parts that act once per step (logic, clocks, the 555, converters, relays): their timing is the step (ADR-018). */
const stepsTheTiming = (type: ComponentType) => type === "clock" || sequentialOf(type) !== undefined

/** Fixed steps when the circuit asks for them, or when it has parts whose timing is one step per change. */
export const usesFixedSteps = (circuit: Circuit): boolean =>
	circuit.simulation.stepping === "fixed" || expandSubcircuits(circuit).components.some((component) => stepsTheTiming(component.type))

/** Moves the circuit on from `state` to the time `until` (or until `maxSteps` steps have been kept). */
export function advanceTransient(given: Circuit, state: TransientState, until: number, options: AdvanceOptions): AdvanceResult {
	// Chips are seen as their parts (format expandSubcircuits; cached, so calling it again costs nothing).
	const circuit = expandSubcircuits(given)
	return usesFixedSteps(circuit) ? advanceFixed(circuit, state, until, options) : advanceAdaptive(circuit, state, until, options)
}

function advanceFixed(circuit: Circuit, start: TransientState, until: number, options: AdvanceOptions): AdvanceResult {
	const { maxStep, onStep, maxSteps = Number.POSITIVE_INFINITY, landOn: _landOn, ...inputs } = options
	const wanted = Math.max(0, Math.floor((until - start.time) / maxStep + 1e-9))
	const steps = Math.min(wanted, maxSteps)
	let state = start
	let solution: DcSolution | undefined
	for (let step = 0; step < steps; step++) {
		const result = stepTransient(circuit, state, { ...inputs, timeStep: maxStep })
		if (!result.ok) return result
		state = result.state
		solution = result.solution
		onStep?.(state, solution)
	}
	if (!solution) return previewed(circuit, state, maxStep, inputs, 0, steps === wanted)
	return { ok: true, state, solution, steps, nextStep: maxStep, reachedUntil: steps === wanted }
}

function advanceAdaptive(circuit: Circuit, start: TransientState, until: number, options: AdvanceOptions): AdvanceResult {
	const { maxStep, initialStep, onStep, maxSteps = Number.POSITIVE_INFINITY, landOn = [], ...inputs } = options
	const smallest = maxStep * SMALLEST_STEP
	let step = Math.min(initialStep ?? maxStep / 10, maxStep)
	let state = start
	let solution: DcSolution | undefined
	let kept = 0
	while (until - state.time > smallest / 2 && kept < maxSteps) {
		const toEdge = Math.min(nextEdge(circuit, state.time), ...landOn.filter((time) => time > state.time * (1 + 1e-12) + 1e-15)) - state.time
		const size = Math.max(smallest, Math.min(step, maxStep, until - state.time, toEdge))
		const whole = stepTransient(circuit, state, { ...inputs, timeStep: size })
		const firstHalf = stepTransient(circuit, state, { ...inputs, timeStep: size / 2 })
		const secondHalf = firstHalf.ok ? stepTransient(circuit, firstHalf.state, { ...inputs, timeStep: size / 2 }) : firstHalf
		if (!whole.ok || !secondHalf.ok) {
			const failed = !whole.ok ? whole : secondHalf
			if (size <= smallest && !failed.ok) return { ok: false, errors: failed.errors }
			step = size * SHRINK
			continue
		}
		const ratio = errorRatio(whole.state.memory, secondHalf.state.memory) / 3
		const resize = ratio === 0 ? GROWTH : Math.min(GROWTH, Math.max(SHRINK, SAFETY * ratio ** (-1 / 3)))
		if (ratio > 1 && size > smallest) {
			step = size * resize
			continue
		}
		// Land exactly on the edge or the end, not a rounding error short of it.
		const landed = size === toEdge ? state.time + toEdge : size === until - state.time ? until : secondHalf.state.time
		state = { ...secondHalf.state, time: landed }
		solution = secondHalf.solution
		kept += 1
		onStep?.(state, solution)
		step = size * resize
	}
	const reachedUntil = until - state.time <= smallest / 2
	if (!solution) return previewed(circuit, state, Math.min(step, maxStep), inputs, 0, reachedUntil)
	return { ok: true, state, solution, steps: kept, nextStep: step, reachedUntil }
}

/** When no step was needed: what the circuit shows now, without moving time on. */
function previewed(circuit: Circuit, state: TransientState, size: number, inputs: DcInputs, steps: number, reachedUntil: boolean): AdvanceResult {
	const next = stepTransient(circuit, state, { ...inputs, timeStep: size })
	return next.ok ? { ok: true, state, solution: next.solution, steps, nextStep: size, reachedUntil } : next
}

/** The largest error found, as a share of what is allowed (above 1: too large). */
function errorRatio(whole: Readonly<Record<string, StoredState>>, halves: Readonly<Record<string, StoredState>>): number {
	let worst = 0
	for (const [key, precise] of Object.entries(halves)) {
		const rough = whole[key]
		if (!rough) continue
		const voltage = Math.abs(precise.voltage - rough.voltage) / (RELATIVE_TOLERANCE * Math.abs(precise.voltage) + VOLTAGE_TOLERANCE)
		const current = Math.abs(precise.current - rough.current) / (RELATIVE_TOLERANCE * Math.abs(precise.current) + CURRENT_TOLERANCE)
		worst = Math.max(worst, voltage, current)
	}
	return worst
}

/** The next square-wave edge after `time` (a breakpoint), or infinity. */
function nextEdge(circuit: Circuit, time: number): number {
	let next = Number.POSITIVE_INFINITY
	for (const component of circuit.components) {
		if (component.type !== "square-source") continue
		const period = 1 / component.params.frequency
		const cycle = Math.floor(time / period + 1e-9)
		for (const offset of [0, component.params.dutyCycle, 1, 1 + component.params.dutyCycle]) {
			const edge = (cycle + offset) * period
			if (edge > time * (1 + 1e-12) + 1e-15) next = Math.min(next, edge)
		}
	}
	return next
}
