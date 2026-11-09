import { type DcResult, type TransientState, advanceTransient, initialTransientState } from "@engineering-circuit/engine"
import type { Circuit } from "@engineering-circuit/format"
import { type FromWorker, MAX_SAMPLES_PER_FRAME, type ScopeSample, type ToWorker } from "./simulation-protocol"

/** The simulation worker's logic, kept free of worker APIs so it can be tested directly. */
export class SimulationRunner {
	private circuit: Circuit | undefined
	private circuitId = 0
	private state: TransientState = initialTransientState()
	private pressed: ReadonlySet<string> = new Set()
	private watched: readonly string[] = []
	/** Simulated seconds requested but smaller than one time step, carried to the next frame. */
	private owed = 0
	/** The step size the last frame ended on, so adaptive steps carry on from it. */
	private nextStep: number | undefined
	private last: DcResult | undefined

	handle(message: ToWorker): FromWorker | undefined {
		switch (message.type) {
			case "load":
				this.circuit = message.circuit
				this.circuitId = message.circuitId
				return undefined
			case "press":
				this.pressed = new Set(message.pressed)
				return undefined
			case "watch":
				this.watched = message.ids
				return undefined
			case "restart":
				this.state = initialTransientState()
				this.owed = 0
				this.nextStep = undefined
				this.last = undefined
				return undefined
			case "advance":
				return this.advance(message.seconds, message.maxSteps)
		}
	}

	/**
	 * Moves time on by `seconds` (plus what earlier frames left over), in at most `maxSteps` steps: adaptive steps
	 * where the circuit allows them, else fixed ones (advanceTransient). Too much for one frame is dropped and
	 * reported as slowed, so the simulation slows down instead of freezing.
	 */
	private advance(seconds: number, maxSteps: number): FromWorker | undefined {
		const circuit = this.circuit
		if (!circuit) return undefined
		const until = this.state.time + this.owed + seconds
		const probes = [
			...circuit.components.filter((component) => component.type === "scope-probe").map((probe) => probe.id),
			...this.watched.filter((id) => circuit.components.some((component) => component.id === id && component.type !== "scope-probe")),
		]
		const recorded: ScopeSample[] = []
		const result = advanceTransient(circuit, this.state, until, {
			maxStep: circuit.simulation.timeStep,
			...(this.nextStep === undefined ? {} : { initialStep: this.nextStep }),
			maxSteps,
			pressed: this.pressed,
			...(probes.length > 0
				? {
						onStep: (state, solution) =>
							recorded.push({ time: state.time, values: Object.fromEntries(probes.map((id) => [id, solution.readings[id]?.voltage ?? 0])) }),
					}
				: {}),
		})
		if (!result.ok) {
			this.last = result
			return { type: "frame", circuitId: this.circuitId, time: this.state.time, result, slowed: false, samples: [] }
		}
		const slowed = !result.reachedUntil
		this.state = result.state
		this.nextStep = result.nextStep
		this.owed = slowed ? 0 : Math.max(0, until - this.state.time)
		if (result.steps > 0 || !this.last) this.last = { ok: true, solution: result.solution }
		return { type: "frame", circuitId: this.circuitId, time: this.state.time, result: this.last, slowed, samples: thinned(recorded) }
	}
}

/** At most MAX_SAMPLES_PER_FRAME samples, spread evenly over the frame's steps and ending with the last. */
function thinned(samples: readonly ScopeSample[]): ScopeSample[] {
	if (samples.length <= MAX_SAMPLES_PER_FRAME) return [...samples]
	return Array.from({ length: MAX_SAMPLES_PER_FRAME }, (_, index) => samples[Math.round(((index + 1) * samples.length) / MAX_SAMPLES_PER_FRAME) - 1]).filter(
		(sample): sample is ScopeSample => sample !== undefined,
	)
}
