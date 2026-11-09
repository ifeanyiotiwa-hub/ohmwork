import { type AcPoint, type Complex, gainAndPhase } from "@engineering-circuit/engine"

export type BodeTrace = { id: string; gain: string; phase: string; peak: number | undefined }
export type BodePlot = {
	range: { start: number; stop: number }
	/** The gain scale, in dB. */
	gain: { min: number; max: number }
	/** A line at each power of ten between the ends. */
	decades: { x: number; frequency: number }[]
	traces: BodeTrace[]
}

/** The gain scale is in steps of this many dB… */
const GAIN_STEP = 10
/** …with at least this much room above and below the traces. */
const GAIN_ROOM = 1
/** The scale stops here; deeper gains (a filter far into its stop band) sit on the bottom edge. */
const GAIN_FLOOR = -120
const HALF_TURN = 180

/**
 * Lays a frequency response out as two width × height plots sharing a log frequency scale across: each scope probe's
 * gain (dB) relative to the input, and its phase (degrees, −180 at the bottom to 180 at the top).
 */
export function bodePlot(
	points: readonly AcPoint[],
	probes: readonly string[],
	input: Complex,
	{ width, height }: { width: number; height: number },
): BodePlot {
	const start = points[0]?.frequency ?? 1
	const stop = points.at(-1)?.frequency ?? start
	const span = Math.log10(stop / start)
	const x = (frequency: number) => (span > 0 ? (Math.log10(frequency / start) / span) * width : 0)
	const round = (value: number) => Math.round(value * 100) / 100

	const responses = probes.map((id) => ({
		id,
		values: points.map((point) => {
			const positive = point.pinVoltages[`${id}:positive`] ?? { re: 0, im: 0 }
			const negative = point.pinVoltages[`${id}:negative`] ?? { re: 0, im: 0 }
			const { decibels, phase } = gainAndPhase({ re: positive.re - negative.re, im: positive.im - negative.im }, input)
			return { frequency: point.frequency, decibels, degrees: (phase * HALF_TURN) / Math.PI }
		}),
	}))
	const gains = responses.flatMap(({ values }) => values.map((value) => value.decibels)).filter(Number.isFinite)
	// The scale always includes 0 dB, where output equals input.
	const min = Math.max(GAIN_FLOOR, Math.floor((Math.min(0, ...gains) - GAIN_ROOM) / GAIN_STEP) * GAIN_STEP)
	const max = Math.ceil((Math.max(0, ...gains) + GAIN_ROOM) / GAIN_STEP) * GAIN_STEP
	const gainY = (decibels: number) => ((max - Math.max(min, decibels)) / (max - min)) * height
	const phaseY = (degrees: number) => height / 2 - (degrees / HALF_TURN) * (height / 2)

	const decades: BodePlot["decades"] = []
	for (let frequency = 10 ** Math.ceil(Math.log10(start)); frequency < stop; frequency *= 10) {
		if (frequency > start) decades.push({ x: round(x(frequency)), frequency })
	}
	return {
		range: { start, stop },
		gain: { min, max },
		decades,
		traces: responses.map(({ id, values }) => ({
			id,
			gain: values.map((value) => `${round(x(value.frequency))},${round(gainY(value.decibels))}`).join(" "),
			phase: values.map((value) => `${round(x(value.frequency))},${round(phaseY(value.degrees))}`).join(" "),
			peak: values.length > 0 ? Math.max(...values.map((value) => value.decibels)) : undefined,
		})),
	}
}
