// Ideal op-amp macro model. CircuitJS1 (OpAmpElm) switches between a gain-of-100000 VCVS and a fixed rail; we use
// the usual smooth form instead, so Newton–Raphson never jumps between modes:
//   target = middle + halfSwing · tanh(gain · (V+ − V−) / halfSwing)
// The output is a source of that target behind a tiny resistance, referenced to ground (no supply pins).
import { type Device, type Linearization, settledBetween } from "./device"

export type OpAmpParams = { gain: number; supplyHigh: number; supplyLow: number }

/** Near-ideal output: 1 mΩ. */
const OUTPUT_CONDUCTANCE = 1000

const NON_INVERTING = 0
const INVERTING = 1
const OUTPUT = 2
const GROUND = 3

/** Terminals: non-inverting input, inverting input, output, and the ground the output is measured from. */
export function opAmpDevice({ gain, supplyHigh, supplyLow }: OpAmpParams, groundPin: string): Device {
	const middle = (supplyHigh + supplyLow) / 2
	const halfSwing = Math.max((supplyHigh - supplyLow) / 2, Number.EPSILON)
	const difference = (voltages: readonly number[]) => (voltages[NON_INVERTING] ?? 0) - (voltages[INVERTING] ?? 0)

	return {
		terminals: ["nonInverting", "inverting", "output", groundPin],
		conducting: [[OUTPUT, GROUND]],
		initialState: (voltages) => [difference(voltages)],
		linearize: (voltages, state): Linearization => {
			const inputs = difference(voltages)
			const swing = Math.tanh((gain * inputs) / halfSwing)
			const target = middle + halfSwing * swing
			const slope = gain * (1 - swing * swing)
			const g = OUTPUT_CONDUCTANCE

			// Current into the output: g·(Vout − Vground − target(V+ − V−)), linear about the present inputs.
			const outputRow = [-g * slope, g * slope, g, -g]
			const outputOffset = -g * (target - slope * inputs)
			return {
				conductance: [[0, 0, 0, 0], [0, 0, 0, 0], outputRow, outputRow.map((value) => -value)],
				offset: [0, 0, outputOffset, -outputOffset],
				state: [inputs],
				settled: settledBetween([inputs], state, false),
			}
		},
		ports: (voltages, currents) => [
			{
				name: "output",
				voltage: (voltages[OUTPUT] ?? 0) - (voltages[GROUND] ?? 0),
				current: currents[OUTPUT] ?? 0,
			},
		],
	}
}
