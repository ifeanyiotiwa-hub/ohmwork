// Bipolar transistor, Ebers–Moll transport form (SPICE Gummel–Poon level 1 without Early effect or resistances),
// with CircuitJS1's junction limiting (TransistorElm.ts).
import { type Device, type Linearization, RUNAWAY_CONDUCTANCE, settledBetween } from "./device"
import { THERMAL_VOLTAGE, criticalVoltage, limitJunction } from "./junction"

export type BipolarParams = { beta: number; betaReverse: number; saturationCurrent: number }

const COLLECTOR = 0
const BASE = 1
const EMITTER = 2

/** NPN for polarity 1, PNP for -1. Terminals: collector, base, emitter. */
export function bipolarDevice({ beta, betaReverse, saturationCurrent }: BipolarParams, polarity: 1 | -1): Device {
	const critical = criticalVoltage(THERMAL_VOLTAGE, saturationCurrent)
	const minimum = saturationCurrent * 0.01
	const junctions = (voltages: readonly number[]) => {
		const base = voltages[BASE] ?? 0
		return [polarity * (base - (voltages[EMITTER] ?? 0)), polarity * (base - (voltages[COLLECTOR] ?? 0))]
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
			const vbe = limitJunction(rawBe, lastBe, THERMAL_VOLTAGE, critical)
			const vbc = limitJunction(rawBc, lastBc, THERMAL_VOLTAGE, critical)

			const forward = saturationCurrent * (Math.exp(vbe / THERMAL_VOLTAGE) - 1) + minimum * vbe
			const reverse = saturationCurrent * (Math.exp(vbc / THERMAL_VOLTAGE) - 1) + minimum * vbc
			const gForward = (saturationCurrent / THERMAL_VOLTAGE) * Math.exp(vbe / THERMAL_VOLTAGE) + minimum
			const gReverse = (saturationCurrent / THERMAL_VOLTAGE) * Math.exp(vbc / THERMAL_VOLTAGE) + minimum

			// Currents into the collector and base, and their slopes against (vbe, vbc).
			const collector = forward - reverse * (1 + 1 / betaReverse)
			const base = forward / beta + reverse / betaReverse
			const dCollector = [gForward, -gReverse * (1 + 1 / betaReverse)] as const
			const dBase = [gForward / beta, gReverse / betaReverse] as const

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
	}
}
