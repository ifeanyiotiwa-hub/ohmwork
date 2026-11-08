// Shockley diode with optional series resistance and Zener breakdown. The breakdown curve is CircuitJS1's
// (Diode.ts): a mirrored exponential offset so that 5 mA flows at the breakdown voltage.
import { type Device, type Linearization, RUNAWAY_CONDUCTANCE, settledBetween } from "./device"
import { THERMAL_VOLTAGE, criticalVoltage, limitJunction } from "./junction"

export type DiodeParams = {
	saturationCurrent: number
	emissionCoefficient: number
	seriesResistance: number
	/** Reverse voltage where 5 mA flows; 0 for a plain diode. */
	breakdownVoltage?: number
}

const ZENER_REFERENCE_CURRENT = -0.005
const ZENER_SCALE = THERMAL_VOLTAGE
/** Inner iterations to split a terminal voltage between the junction and the series resistance. */
const SERIES_ITERATIONS = 100

type Curve = { current(junction: number): number; conductance(junction: number): number; limit(next: number, previous: number): number }

function curveOf({ saturationCurrent, emissionCoefficient, breakdownVoltage = 0 }: DiodeParams): Curve {
	const scale = emissionCoefficient * THERMAL_VOLTAGE
	const critical = criticalVoltage(scale, saturationCurrent)
	// CircuitJS1 puts a conductance of 1% of IS across each junction so the matrix never becomes singular.
	const minimum = saturationCurrent * 0.01
	const zener = breakdownVoltage > 0
	const offset = zener ? breakdownVoltage - Math.log(-(1 + ZENER_REFERENCE_CURRENT / saturationCurrent)) * ZENER_SCALE : 0
	const zenerCritical = criticalVoltage(ZENER_SCALE, saturationCurrent)

	return {
		current: (junction) => {
			const forward = Math.exp(junction / scale)
			const reverse = zener && junction < 0 ? Math.exp((-junction - offset) / ZENER_SCALE) : 0
			return saturationCurrent * (forward - reverse - 1) + minimum * junction
		},
		conductance: (junction) => {
			const forward = Math.exp(junction / scale) / scale
			const reverse = zener && junction < 0 ? Math.exp((-junction - offset) / ZENER_SCALE) / ZENER_SCALE : 0
			return saturationCurrent * (forward + reverse) + minimum
		},
		limit: (next, previous) => {
			if (next >= 0 || !zener) return limitJunction(next, previous, scale, critical)
			// In breakdown, limit the mirrored voltage the same way.
			const mirrored = limitJunction(-next - offset, -previous - offset, ZENER_SCALE, zenerCritical)
			return -(mirrored + offset)
		},
	}
}

/** A diode between `anode` and `cathode` pins (named per part: an RGB LED uses a colour pin and its common pin). */
export function diodeDevice(params: DiodeParams, anode: string, cathode: string): Device {
	const curve = curveOf(params)
	const resistance = params.seriesResistance

	/** The junction voltage for a terminal voltage: v = vj + RS·I(vj), solved by Newton from `start`. */
	const junctionFor = (terminal: number, start: number): { junction: number; limited: boolean } => {
		if (resistance === 0) {
			const junction = curve.limit(terminal, start)
			return { junction, limited: junction !== terminal }
		}
		let junction = start
		for (let iteration = 0; iteration < SERIES_ITERATIONS; iteration++) {
			const error = junction + resistance * curve.current(junction) - terminal
			const slope = 1 + resistance * curve.conductance(junction)
			const next = curve.limit(junction - error / slope, junction)
			if (Math.abs(next - junction) < 1e-12) break
			junction = next
		}
		return { junction, limited: false }
	}

	return {
		terminals: [anode, cathode],
		conducting: [[0, 1]],
		initialState: (voltages) => [(voltages[0] ?? 0) - (voltages[1] ?? 0)],
		linearize: (voltages, state): Linearization => {
			const previous = state[0] ?? 0
			const { junction, limited } = junctionFor((voltages[0] ?? 0) - (voltages[1] ?? 0), previous)
			const current = curve.current(junction)
			const junctionConductance = curve.conductance(junction)
			const conductance = junctionConductance / (1 + resistance * junctionConductance)
			// Linear about the terminal voltage that gives this junction voltage.
			const terminal = junction + resistance * current
			const offset = current - conductance * terminal
			return {
				conductance: [
					[conductance, -conductance],
					[-conductance, conductance],
				],
				offset: [offset, -offset],
				state: [junction],
				settled: settledBetween([junction], [previous], limited),
				runaway: !(conductance <= RUNAWAY_CONDUCTANCE),
			}
		},
	}
}
