import type { ComponentType } from "@engineering-circuit/format"

/**
 * How a part's main value is turned with the value dial: through the E12 series (resistors, capacitors and the like
 * are sold in it, so every stop is a part you could buy), or in even steps between optional limits.
 */
export type Dial = { param: string; steps: "e12" } | { param: string; steps: "even"; size: number; min?: number; max?: number }

/** E12 preferred numbers (IEC 60063): twelve per decade. */
const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]
/** Values within this fraction of a series value count as on it (they came from arithmetic on a series value). */
const SAME = 1e-9

const e12 = (param: string): Dial => ({ param, steps: "e12" })
const even = (param: string, size: number, min?: number, max?: number): Dial => ({
	param,
	steps: "even",
	size,
	...(min === undefined ? {} : { min }),
	...(max === undefined ? {} : { max }),
})

const DIALS: Partial<Record<ComponentType, Dial>> = {
	resistor: e12("resistance"),
	capacitor: e12("capacitance"),
	"polarized-capacitor": e12("capacitance"),
	inductor: e12("inductance"),
	"voltage-source": even("voltage", 0.1),
	"voltage-rail": even("voltage", 0.1),
	"current-source": e12("current"),
	"ac-source": even("amplitude", 0.1, 0),
	"square-source": even("high", 0.1),
	clock: e12("frequency"),
	potentiometer: even("position", 0.01, 0, 1),
	lamp: even("ratedVoltage", 0.1, 0.1),
}

/** The dial for a part type, if its main value can be turned. */
export const dialOf = (type: ComponentType): Dial | undefined => DIALS[type]

/** The next value one step up (direction 1) or down (−1). */
export function stepValue(dial: Dial, value: number, direction: 1 | -1): number {
	if (dial.steps === "even") {
		const next = Math.round((value + direction * dial.size) / dial.size) * dial.size
		const rounded = Number(next.toPrecision(12))
		return Math.min(dial.max ?? Number.POSITIVE_INFINITY, Math.max(dial.min ?? Number.NEGATIVE_INFINITY, rounded))
	}
	if (value === 0) return value
	const magnitude = Math.abs(value)
	return Math.sign(value) * nextInSeries(magnitude, direction)
}

/** The E12 value just above (or below) a positive value. */
function nextInSeries(magnitude: number, direction: 1 | -1): number {
	const decade = Math.floor(Math.log10(magnitude))
	const candidates = [decade - 1, decade, decade + 1].flatMap((power) => E12.map((mantissa) => Number((mantissa * 10 ** power).toPrecision(12))))
	return direction === 1
		? (candidates.find((candidate) => candidate > magnitude * (1 + SAME)) ?? magnitude)
		: ([...candidates].reverse().find((candidate) => candidate < magnitude * (1 - SAME)) ?? magnitude)
}
