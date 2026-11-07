import type { ScopeSample } from "../simulation/simulation-protocol"

export type ScopeTrace = { id: string; points: string; latest: number | undefined }
export type ScopePlot = {
	window: { start: number; end: number }
	range: { min: number; max: number }
	traces: ScopeTrace[]
}

/** Head-room above and below the traces, as a share of their span. */
const MARGIN = 0.1
/** Half-height of the range shown for a flat trace, in volts. */
const FLAT_SPAN = 1

/**
 * Lays scope samples out in a width × height box: the last `windowSeconds` of simulated time across, all probes on
 * one shared voltage scale up the side (higher voltage is higher on screen).
 */
export function scopePlot(
	samples: readonly ScopeSample[],
	probes: readonly string[],
	windowSeconds: number,
	{ width, height }: { width: number; height: number },
): ScopePlot {
	const end = samples.at(-1)?.time ?? 0
	const start = end - windowSeconds
	const visible = samples.filter((sample) => sample.time >= start - 1e-12)
	const values = visible.flatMap((sample) => probes.map((probe) => sample.values[probe] ?? 0))

	let min = values.length > 0 ? Math.min(...values) : -FLAT_SPAN
	let max = values.length > 0 ? Math.max(...values) : FLAT_SPAN
	if (max - min < 1e-9) {
		min -= FLAT_SPAN
		max += FLAT_SPAN
	}
	const margin = (max - min) * MARGIN
	min -= margin
	max += margin

	const x = (time: number) => (windowSeconds > 0 ? ((time - start) / windowSeconds) * width : width)
	const y = (voltage: number) => height - ((voltage - min) / (max - min)) * height
	const round = (value: number) => Math.round(value * 100) / 100

	return {
		window: { start, end },
		range: { min, max },
		traces: probes.map((id) => ({
			id,
			points: visible.map((sample) => `${round(x(sample.time))},${round(y(sample.values[id] ?? 0))}`).join(" "),
			latest: visible.at(-1)?.values[id],
		})),
	}
}
