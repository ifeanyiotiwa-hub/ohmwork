// Op-amp macro model, referenced to ground (no supply pins). CircuitJS1 (OpAmpElm) switches between a gain-of-100000
// VCVS and a fixed rail; we use the usual smooth form instead, so Newton–Raphson never jumps between modes:
//   drive  = gain · (V+ − V−)                       (at DC; over time it follows a single pole, below)
//   target = middle + halfSwing · tanh(drive / halfSwing)
//   output = target behind 1 mΩ, until the current it would deliver passes maxOutputCurrent: then a current source of
//            that size (a mode switch between Newton iterations, as CircuitJS1 switches its op-amp's output)
// Over time the drive follows d(drive)/dt = ωp · (gain · (V+ − V−) − drive), ωp = 2π · gainBandwidth / gain (one pole,
// the standard first-order op-amp model), stepped with backward Euler, and changes by at most slewRate · Δt per step.
// In AC analysis the same pole divides the gain: gain / (1 + jω/ωp).
import { complex, complexMatrix, over } from "../linear/complex"
import { type Device, type Linearization, settledBetween } from "./device"

export type OpAmpParams = {
	gain: number
	supplyHigh: number
	supplyLow: number
	gainBandwidth: number
	slewRate: number
	maxOutputCurrent: number
}
/** Over time: the step and the drive at the end of the last step. */
export type OpAmpStep = { timeStep: number; previousDrive: number }

/** Near-ideal output: 1 mΩ. */
const OUTPUT_CONDUCTANCE = 1000
/** In current-limit mode the output keeps a negligible conductance, so the node never floats. */
const LIMITED_CONDUCTANCE = 1e-9
/**
 * Output modes, kept in the Newton state with how many iterations it has been in: the 1 mΩ source, or the current
 * limit sinking (+1, current into the output) or sourcing (−1).
 */
const SOURCE = 0

/**
 * Over time the drive is held within this many half-swings of the middle: far enough that the output is within
 * 0.01% of its rail, near enough that coming out of saturation is not delayed by an internal wind-up.
 */
const DRIVE_LIMIT = 5

const NON_INVERTING = 0
const INVERTING = 1
const OUTPUT = 2
const GROUND = 3

/** Terminals: non-inverting input, inverting input, output, and the ground the output is measured from. */
export function opAmpDevice(params: OpAmpParams, groundPin: string, step?: OpAmpStep): Device {
	const { gain, supplyHigh, supplyLow, gainBandwidth, slewRate, maxOutputCurrent } = params
	const middle = (supplyHigh + supplyLow) / 2
	const halfSwing = Math.max((supplyHigh - supplyLow) / 2, Number.EPSILON)
	const difference = (voltages: readonly number[]) => (voltages[NON_INVERTING] ?? 0) - (voltages[INVERTING] ?? 0)

	/** The drive for an input difference, and how fast it changes with it. */
	const driveOf = (inputs: number): { drive: number; slope: number } => {
		if (!step) return { drive: gain * inputs, slope: gain }
		const pole = step.timeStep * ((2 * Math.PI * gainBandwidth) / gain)
		const followed = (step.previousDrive + pole * gain * inputs) / (1 + pole)
		const reach = slewRate * step.timeStep
		const limit = DRIVE_LIMIT * halfSwing
		const slewed = Math.min(step.previousDrive + reach, Math.max(step.previousDrive - reach, followed))
		const drive = Math.min(limit, Math.max(-limit, slewed))
		return { drive, slope: drive === followed ? (pole * gain) / (1 + pole) : 0 }
	}

	return {
		terminals: ["nonInverting", "inverting", "output", groundPin],
		conducting: [[OUTPUT, GROUND]],
		initialState: (voltages) => [difference(voltages), SOURCE, 0],
		linearize: (voltages, state): Linearization => {
			const inputs = difference(voltages)
			const { drive, slope: driveSlope } = driveOf(inputs)
			const swing = Math.tanh(drive / halfSwing)
			const target = middle + halfSwing * swing
			const slope = driveSlope * (1 - swing * swing)

			// The mode changes only once the present mode has been solved at least once and the inputs have settled, so
			// the figures below are real, not a first guess (switching on a guess would chatter).
			//  - From the 1 mΩ source to the limit: when the current it carries passes maxOutputCurrent.
			//  - From the limit back: when the output has reached its target in the direction it was pushed, so the
			//    source would need less than the limit.
			const across = (voltages[OUTPUT] ?? 0) - (voltages[GROUND] ?? 0)
			const previousMode = state[1] ?? SOURCE
			const iterationsInMode = state[2] ?? 0
			const inputsSettled = settledBetween([inputs], [state[0] ?? 0], false)
			const carried = OUTPUT_CONDUCTANCE * (across - target)
			let mode = previousMode
			if (inputsSettled && iterationsInMode >= 1) {
				if (previousMode === SOURCE && Math.abs(carried) > maxOutputCurrent) mode = Math.sign(carried)
				if (previousMode !== SOURCE && previousMode * (across - target) <= 0) mode = SOURCE
			}
			const settled = inputsSettled && mode === previousMode && iterationsInMode >= 1
			const nextState = [inputs, mode, mode === previousMode ? iterationsInMode + 1 : 0]

			if (mode !== SOURCE) {
				// Current limit: a fixed current into the output (positive = sinking), whatever the voltage.
				const row = [0, 0, LIMITED_CONDUCTANCE, -LIMITED_CONDUCTANCE]
				const offset = mode * maxOutputCurrent - LIMITED_CONDUCTANCE * across
				return {
					conductance: [[0, 0, 0, 0], [0, 0, 0, 0], row, row.map((value) => -value)],
					offset: [0, 0, offset, -offset],
					state: nextState,
					settled,
				}
			}
			// Current into the output: g·(Vout − Vground − target(V+ − V−)), linear about the present inputs.
			const g = OUTPUT_CONDUCTANCE
			const outputRow = [-g * slope, g * slope, g, -g]
			const outputOffset = -g * (target - slope * inputs)
			return {
				conductance: [[0, 0, 0, 0], [0, 0, 0, 0], outputRow, outputRow.map((value) => -value)],
				offset: [0, 0, outputOffset, -outputOffset],
				state: nextState,
				settled,
			}
		},
		ports: (voltages, currents) => [
			{
				name: "output",
				voltage: (voltages[OUTPUT] ?? 0) - (voltages[GROUND] ?? 0),
				current: currents[OUTPUT] ?? 0,
			},
		],
		acAdmittance: (_voltages, linearization, omega) => {
			const admittance = complexMatrix(linearization.conductance)
			const pole = (2 * Math.PI * gainBandwidth) / gain
			const rolloff = over(complex(1), complex(1, omega / pole))
			const output = admittance[OUTPUT]
			const ground = admittance[GROUND]
			for (const input of [NON_INVERTING, INVERTING]) {
				const outputEntry = linearization.conductance[OUTPUT]?.[input] ?? 0
				if (output) output[input] = complex(outputEntry * rolloff.re, outputEntry * rolloff.im)
				if (ground) ground[input] = complex(-outputEntry * rolloff.re, -outputEntry * rolloff.im)
			}
			return admittance
		},
		// Where its internal drive had got to, for the next step.
		remember: (voltages) => [{ name: "drive", voltage: driveOf(difference(voltages)).drive, current: 0 }],
	}
}
