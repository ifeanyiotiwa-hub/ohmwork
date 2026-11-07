import { type DcResult, type TransientState, initialTransientState, stepTransient } from "@engineering-circuit/engine"
import type { Circuit } from "@engineering-circuit/format"
import type { FromWorker, ToWorker } from "./simulation-protocol"

/** The simulation worker's logic, kept free of worker APIs so it can be tested directly. */
export class SimulationRunner {
	private circuit: Circuit | undefined
	private circuitId = 0
	private state: TransientState = initialTransientState()
	private pressed: ReadonlySet<string> = new Set()
	/** Simulated seconds requested but smaller than one time step, carried to the next frame. */
	private owed = 0
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
			case "restart":
				this.state = initialTransientState()
				this.owed = 0
				this.last = undefined
				return undefined
			case "advance":
				return this.advance(message.seconds, message.maxSteps)
		}
	}

	private advance(seconds: number, maxSteps: number): FromWorker | undefined {
		const circuit = this.circuit
		if (!circuit) return undefined
		const { timeStep } = circuit.simulation
		this.owed += seconds
		const wanted = Math.floor(this.owed / timeStep + 1e-9)
		const steps = Math.min(wanted, maxSteps)
		const slowed = wanted > maxSteps
		this.owed = slowed ? 0 : this.owed - steps * timeStep

		for (let step = 0; step < steps; step++) {
			const result = stepTransient(circuit, this.state, { timeStep, pressed: this.pressed })
			if (!result.ok) {
				this.last = result
				break
			}
			this.state = result.state
			this.last = { ok: true, solution: result.solution }
		}
		const result = this.last ?? this.preview(circuit)
		return { type: "frame", circuitId: this.circuitId, time: this.state.time, result, slowed }
	}

	/** What one step from now would show, without moving time on (for frames shorter than a step). */
	private preview(circuit: Circuit): DcResult {
		const next = stepTransient(circuit, this.state, { timeStep: circuit.simulation.timeStep, pressed: this.pressed })
		return next.ok ? { ok: true, solution: next.solution } : next
	}
}
