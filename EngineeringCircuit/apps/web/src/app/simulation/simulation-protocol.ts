import type { DcResult } from "@engineering-circuit/engine"
import type { Circuit } from "@engineering-circuit/format"

/** Messages to the simulation worker. `circuitId` lets the app ignore frames solved for an older circuit. */
export type ToWorker =
	| { type: "load"; circuit: Circuit; circuitId: number }
	| { type: "press"; pressed: string[] }
	| { type: "restart" }
	| { type: "advance"; seconds: number; maxSteps: number }

/** Scope probe voltages (positive − negative) at one moment, keyed by probe id. */
export type ScopeSample = { time: number; values: Record<string, number> }

/** Scope samples per frame at most, spread evenly over the frame's time steps. */
export const MAX_SAMPLES_PER_FRAME = 64

/** One animation frame's result. `slowed`: the steps needed were capped, so simulated time fell behind. */
export type FromWorker = {
	type: "frame"
	circuitId: number
	time: number
	result: DcResult
	slowed: boolean
	samples: ScopeSample[]
}
