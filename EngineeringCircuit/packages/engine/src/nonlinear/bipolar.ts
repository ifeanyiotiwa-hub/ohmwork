// Bipolar transistor, Ebers–Moll transport form (SPICE Gummel–Poon level 1 without resistances or high-injection
// effects), with CircuitJS1's junction limiting (TransistorElm.ts). Added from Gummel–Poon:
//  - the forward Early effect: the transport current is scaled by (1 − vbc/VAF), as qb = 1/(1 − vbc/VAF);
//  - stored charge over time: Qbe = CJE·vbe + TF·If and Qbc = CJC·vbc + TR·Ir (zero-bias junction capacitances held
//    constant, and the transit-time charge), each stepped with backward Euler;
//  - temperature: the thermal voltage and the saturation current follow it (junction.ts).
import { type Device, type Linearization, RUNAWAY_CONDUCTANCE, settledBetween } from "./device"
import { NOMINAL_TEMPERATURE, criticalVoltage, limitJunction, saturationCurrentAt, thermalVoltageAt } from "./junction"

export type BipolarParams = {
	beta: number
	betaReverse: number
	saturationCurrent: number
	earlyVoltage: number
	emitterCapacitance: number
	collectorCapacitance: number
	transitTime: number
	reverseTransitTime: number
}
/** Over time: the step and the charges at the end of the last one (base–emitter, base–collector). */
export type BipolarStep = { timeStep: number; previousCharges: readonly [number, number] }

const COLLECTOR = 0
const BASE = 1
const EMITTER = 2

/** NPN for polarity 1, PNP for -1. Terminals: collector, base, emitter. */
export function bipolarDevice(
	params: BipolarParams,
	polarity: 1 | -1,
	{ temperature = NOMINAL_TEMPERATURE, step }: { temperature?: number; step?: BipolarStep } = {},
): Device {
	const { beta, betaReverse, earlyVoltage, emitterCapacitance, collectorCapacitance, transitTime, reverseTransitTime } = params
	const thermal = thermalVoltageAt(temperature)
	const saturationCurrent = saturationCurrentAt(params.saturationCurrent, temperature)
	const critical = criticalVoltage(thermal, saturationCurrent)
	const minimum = saturationCurrent * 0.01
	const junctions = (voltages: readonly number[]) => {
		const base = voltages[BASE] ?? 0
		return [polarity * (base - (voltages[EMITTER] ?? 0)), polarity * (base - (voltages[COLLECTOR] ?? 0))]
	}
	/** Junction currents and their slopes at (vbe, vbc). */
	const diodes = (vbe: number, vbc: number) => ({
		forward: saturationCurrent * (Math.exp(vbe / thermal) - 1) + minimum * vbe,
		reverse: saturationCurrent * (Math.exp(vbc / thermal) - 1) + minimum * vbc,
		gForward: (saturationCurrent / thermal) * Math.exp(vbe / thermal) + minimum,
		gReverse: (saturationCurrent / thermal) * Math.exp(vbc / thermal) + minimum,
	})
	/** Charge stored across each junction, for the time steps. */
	const charges = (vbe: number, vbc: number): [number, number] => {
		const { forward, reverse } = diodes(vbe, vbc)
		return [emitterCapacitance * vbe + transitTime * forward, collectorCapacitance * vbc + reverseTransitTime * reverse]
	}

	return {
		terminals: ["collector", "base", "emitter"],
		conducting: [
			[BASE, EMITTER],
			[BASE, COLLECTOR],
		],
		initialState: junctions,
		linearize: (voltages, state): Linearization => {
			const [rawBe = 0, rawBc = 0] = junctions(voltages)
			const [lastBe = 0, lastBc = 0] = state
			const vbe = limitJunction(rawBe, lastBe, thermal, critical)
			const vbc = limitJunction(rawBc, lastBc, thermal, critical)
			const { forward, reverse, gForward, gReverse } = diodes(vbe, vbc)

			// Early effect: the transport current (If − Ir) scaled by (1 − vbc/VAF).
			const early = 1 - vbc / earlyVoltage
			const transport = forward - reverse
			let collector = transport * early - reverse / betaReverse
			let base = forward / beta + reverse / betaReverse
			const dCollector: [number, number] = [gForward * early, -gReverse * early - transport / earlyVoltage - gReverse / betaReverse]
			const dBase: [number, number] = [gForward / beta, gReverse / betaReverse]

			if (step) {
				// Charging current of each junction over the step (backward Euler): into the base, out of the
				// emitter (base–emitter) and out of the collector (base–collector).
				const [qBe, qBc] = charges(vbe, vbc)
				const [previousBe, previousBc] = step.previousCharges
				const capBe = (emitterCapacitance + transitTime * gForward) / step.timeStep
				const capBc = (collectorCapacitance + reverseTransitTime * gReverse) / step.timeStep
				const chargingBe = (qBe - previousBe) / step.timeStep
				const chargingBc = (qBc - previousBc) / step.timeStep
				collector -= chargingBc
				base += chargingBe + chargingBc
				dCollector[1] -= capBc
				dBase[0] += capBe
				dBase[1] += capBc
			}

			// vbe = p(Vb − Ve), vbc = p(Vb − Vc): rows of d(junction)/d(terminal) without p, over (Vc, Vb, Ve).
			const row = (slopes: readonly [number, number]) => [-slopes[1], slopes[0] + slopes[1], -slopes[0]]
			const collectorRow = row(dCollector)
			const baseRow = row(dBase)
			const emitterRow = collectorRow.map((value, index) => -(value + (baseRow[index] ?? 0)))
			const collectorOffset = polarity * (collector - dCollector[0] * vbe - dCollector[1] * vbc)
			const baseOffset = polarity * (base - dBase[0] * vbe - dBase[1] * vbc)

			return {
				conductance: [collectorRow, baseRow, emitterRow],
				offset: [collectorOffset, baseOffset, -(collectorOffset + baseOffset)],
				state: [vbe, vbc],
				settled: settledBetween([vbe, vbc], [lastBe, lastBc], vbe !== rawBe || vbc !== rawBc),
				runaway: !(Math.max(gForward, gReverse) <= RUNAWAY_CONDUCTANCE),
			}
		},
		ports: (voltages, currents) => [
			{ name: "base-emitter", voltage: (voltages[BASE] ?? 0) - (voltages[EMITTER] ?? 0), current: currents[BASE] ?? 0 },
			{
				name: "collector-emitter",
				voltage: (voltages[COLLECTOR] ?? 0) - (voltages[EMITTER] ?? 0),
				current: currents[COLLECTOR] ?? 0,
			},
		],
		// The charge across each junction for the next step: base–emitter in "voltage", base–collector in "current".
		remember: (voltages) => {
			const [vbe = 0, vbc = 0] = junctions(voltages)
			const [qBe, qBc] = charges(vbe, vbc)
			return [{ name: "charge", voltage: qBe, current: qBc }]
		},
	}
}
