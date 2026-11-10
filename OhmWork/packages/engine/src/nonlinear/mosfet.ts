// MOSFET square law (SPICE level 1 without channel-length modulation), as CircuitJS1's MosfetElm with λ = 0.
// Drain and source swap when Vds < 0, so the part is symmetric. Gate voltage steps are limited to 0.5 V per
// iteration, as CircuitJS1 does.
import { type Device, type Linearization, settledBetween } from "./device"

export type MosfetParams = { thresholdVoltage: number; transconductance: number }

const DRAIN = 0
const GATE = 1
const SOURCE = 2
const MAX_STEP = 0.5
/** A tiny drain–source conductance so a switched-off MOSFET never leaves a node without an equation. */
const MINIMUM_CONDUCTANCE = 1e-12

const limited = (next: number, previous: number) => previous + Math.max(-MAX_STEP, Math.min(MAX_STEP, next - previous))

/** Drain current and its slopes for vds ≥ 0. */
function squareLaw(vgs: number, vds: number, threshold: number, k: number) {
	const overdrive = vgs - threshold
	if (overdrive <= 0) return { current: 0, gm: 0, gds: 0 }
	if (vds < overdrive) return { current: k * (overdrive * vds - (vds * vds) / 2), gm: k * vds, gds: k * (overdrive - vds) }
	return { current: (k / 2) * overdrive * overdrive, gm: k * overdrive, gds: 0 }
}

/** N-channel for polarity 1, P-channel for -1. Terminals: drain, gate, source. */
export function mosfetDevice({ thresholdVoltage, transconductance }: MosfetParams, polarity: 1 | -1): Device {
	const controls = (voltages: readonly number[]) => {
		const source = voltages[SOURCE] ?? 0
		return [polarity * ((voltages[GATE] ?? 0) - source), polarity * ((voltages[DRAIN] ?? 0) - source)]
	}

	return {
		terminals: ["drain", "gate", "source"],
		conducting: [[DRAIN, SOURCE]],
		initialState: controls,
		linearize: (voltages, state): Linearization => {
			const [rawGs = 0, rawDs = 0] = controls(voltages)
			const [lastGs = 0, lastDs = 0] = state
			const vgs = limited(rawGs, lastGs)
			const vds = limited(rawDs, lastDs)

			// For vds < 0 the source and drain swap: id(vgs, vds) = −f(vgs − vds, −vds).
			let current: number
			let dGs: number
			let dDs: number
			if (vds >= 0) {
				const law = squareLaw(vgs, vds, thresholdVoltage, transconductance)
				current = law.current
				dGs = law.gm
				dDs = law.gds
			} else {
				const law = squareLaw(vgs - vds, -vds, thresholdVoltage, transconductance)
				current = -law.current
				dGs = -law.gm
				dDs = law.gm + law.gds
			}
			current += MINIMUM_CONDUCTANCE * vds
			dDs += MINIMUM_CONDUCTANCE

			// vgs = p(Vg − Vs), vds = p(Vd − Vs), over (Vd, Vg, Vs).
			const drainRow = [dDs, dGs, -(dDs + dGs)]
			const drainOffset = polarity * (current - dGs * vgs - dDs * vds)
			return {
				conductance: [drainRow, [0, 0, 0], drainRow.map((value) => -value)],
				offset: [drainOffset, 0, -drainOffset],
				state: [vgs, vds],
				settled: settledBetween([vgs, vds], [lastGs, lastDs], vgs !== rawGs || vds !== rawDs),
			}
		},
		ports: (voltages, currents) => [
			{ name: "gate-source", voltage: (voltages[GATE] ?? 0) - (voltages[SOURCE] ?? 0), current: currents[GATE] ?? 0 },
			{ name: "drain-source", voltage: (voltages[DRAIN] ?? 0) - (voltages[SOURCE] ?? 0), current: currents[DRAIN] ?? 0 },
		],
	}
}
