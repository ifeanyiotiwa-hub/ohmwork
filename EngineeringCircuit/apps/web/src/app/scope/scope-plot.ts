import type { ScopeSample } from "../simulation/simulation-protocol"

export type Range = { min: number; max: number }
export type ScopeTrace = { id: string; points: string; latest: number | undefined; range: Range }
export type ScopePlot = {
	window: { start: number; end: number }
	/** The shared scale (with separate scales: the first trace's). */
	range: Range
	traces: ScopeTrace[]
	/** Whether the window was placed at a trigger crossing (else it shows the latest samples). */
	triggered: boolean
}
export type ScopeOptions = {
	/** Start the window at a rising crossing of the first trace's middle, so a repeating wave stands still. */
	trigger?: boolean
	/** Scale each trace to itself instead of all to one shared range. */
	separateScales?: boolean
}
type Box = { width: number; height: number }

/** Head-room above and below the traces, as a share of their span. */
const MARGIN = 0.1
/** Half-height of the range shown for a flat trace, in volts. */
const FLAT_SPAN = 1
const round = (value: number) => Math.round(value * 100) / 100

/** The range of some values with a margin; a flat (or empty) set gets ±FLAT_SPAN around its value. */
function rangeOf(values: readonly number[]): Range {
	let min = values.length > 0 ? Math.min(...values) : -FLAT_SPAN
	let max = values.length > 0 ? Math.max(...values) : FLAT_SPAN
	if (max - min < 1e-9) {
		min -= FLAT_SPAN
		max += FLAT_SPAN
	}
	const margin = (max - min) * MARGIN
	return { min: min - margin, max: max + margin }
}

/**
 * The latest time the trace rises through the middle of its range with `window` of samples after it (interpolated
 * between samples), or undefined when it never does.
 */
function triggerTime(samples: readonly ScopeSample[], probe: string, window: number): number | undefined {
	const values = samples.map((sample) => sample.values[probe] ?? 0)
	if (values.length < 2 || Math.max(...values) - Math.min(...values) < 1e-9) return undefined
	const level = (Math.max(...values) + Math.min(...values)) / 2
	const end = samples.at(-1)?.time ?? 0
	for (let index = samples.length - 1; index > 0; index--) {
		const before = values[index - 1] ?? 0
		const after = values[index] ?? 0
		if (!(before < level && after >= level)) continue
		const from = samples[index - 1]?.time ?? 0
		const to = samples[index]?.time ?? 0
		const time = from + ((level - before) / (after - before)) * (to - from)
		if (time + window <= end + 1e-12) return time
	}
	return undefined
}

/**
 * Lays scope samples out in a width × height box: `windowSeconds` of simulated time across (the latest, or from a
 * trigger crossing), voltage up the side on one shared scale or one per trace (higher voltage is higher on screen).
 */
export function scopePlot(
	samples: readonly ScopeSample[],
	probes: readonly string[],
	windowSeconds: number,
	{ width, height }: Box,
	{ trigger = false, separateScales = false }: ScopeOptions = {},
): ScopePlot {
	const [first] = probes
	const triggeredAt = trigger && first !== undefined ? triggerTime(samples, first, windowSeconds) : undefined
	const end = triggeredAt === undefined ? (samples.at(-1)?.time ?? 0) : triggeredAt + windowSeconds
	const start = end - windowSeconds
	const visible = samples.filter((sample) => sample.time >= start - 1e-12 && sample.time <= end + 1e-12)
	const valuesOf = (probe: string) => visible.map((sample) => sample.values[probe] ?? 0)
	const shared = rangeOf(probes.flatMap(valuesOf))

	const x = (time: number) => (windowSeconds > 0 ? ((time - start) / windowSeconds) * width : width)
	const traces = probes.map((id) => {
		const range = separateScales ? rangeOf(valuesOf(id)) : shared
		const y = (voltage: number) => height - ((voltage - range.min) / (range.max - range.min)) * height
		return {
			id,
			points: visible.map((sample) => `${round(x(sample.time))},${round(y(sample.values[id] ?? 0))}`).join(" "),
			latest: visible.at(-1)?.values[id],
			range,
		}
	})
	return { window: { start, end }, range: separateScales ? (traces[0]?.range ?? shared) : shared, traces, triggered: triggeredAt !== undefined }
}

export type XyPlot = { points: string; x: Range; y: Range }

/** The last `windowSeconds` of one trace (y, up) against another (x, across), each on its own scale. */
export function xyPlot(samples: readonly ScopeSample[], xProbe: string, yProbe: string, windowSeconds: number, { width, height }: Box): XyPlot {
	const end = samples.at(-1)?.time ?? 0
	const visible = samples.filter((sample) => sample.time >= end - windowSeconds - 1e-12)
	const xs = visible.map((sample) => sample.values[xProbe] ?? 0)
	const ys = visible.map((sample) => sample.values[yProbe] ?? 0)
	const x = rangeOf(xs)
	const y = rangeOf(ys)
	const points = xs
		.map((value, index) => {
			const across = ((value - x.min) / (x.max - x.min)) * width
			const up = height - (((ys[index] ?? 0) - y.min) / (y.max - y.min)) * height
			return `${round(across)},${round(up)}`
		})
		.join(" ")
	return { points, x, y }
}
