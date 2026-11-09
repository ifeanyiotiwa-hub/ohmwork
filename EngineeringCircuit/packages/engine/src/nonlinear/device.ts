/**
 * A non-linear part, linearized afresh in each Newton–Raphson iteration. Around the present guess its terminal
 * currents are approximated as I = G·V + offset (V: terminal voltages; I: current into each terminal).
 */
export type Linearization = {
	conductance: readonly (readonly number[])[]
	offset: readonly number[]
	/** Junction voltages actually used (after limiting); the next iteration starts from them. */
	state: readonly number[]
	/** False while the junction voltages are still moving or were limited this iteration. */
	settled: boolean
	/** A junction driven with nothing to limit its current (its conductance passed RUNAWAY_CONDUCTANCE). */
	runaway?: boolean
}

/**
 * A junction whose conductance passes this (siemens: 1 µΩ, tens of kiloamps) is being driven by a source with
 * nothing to limit its current. The ideal answer is an impossible current, so it is reported instead.
 */
export const RUNAWAY_CONDUCTANCE = 1e6

export type PortReading = { name: string; voltage: number; current: number }

export type Device = {
	terminals: readonly string[]
	/** Terminal pairs that conduct, for the topology checks (a MOSFET's gate conducts to nothing). */
	conducting: readonly (readonly [number, number])[]
	initialState(voltages: readonly number[]): readonly number[]
	linearize(voltages: readonly number[], state: readonly number[]): Linearization
	/** Named readings for parts with more than two terminals (a transistor's base-emitter, collector-emitter). */
	ports?(voltages: readonly number[], currents: readonly number[]): PortReading[]
	/**
	 * The part's own working that the next time step needs (a transistor's stored charge, an op-amp's internal drive):
	 * kept between steps, never shown as a reading. Two numbers per entry, in the reading's fields.
	 */
	remember?(voltages: readonly number[], currents: readonly number[]): PortReading[]
}

/** Junction voltages settle when they move less than this between iterations. */
export const JUNCTION_TOLERANCE = 1e-6

export const settledBetween = (next: readonly number[], previous: readonly number[], limited: boolean) =>
	!limited && next.every((value, index) => Math.abs(value - (previous[index] ?? 0)) <= JUNCTION_TOLERANCE + 1e-3 * Math.abs(value))
