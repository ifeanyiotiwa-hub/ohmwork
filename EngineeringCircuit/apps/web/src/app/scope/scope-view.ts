import { Component, computed, inject, signal } from "@angular/core"
import { solveAc } from "@engineering-circuit/engine"
import { CircuitStore } from "../circuit/circuit-store"
import { formatSi } from "../circuit/si-units"
import { UI_CONFIG } from "../circuit/ui-config"
import { bodePlot } from "./bode-plot"
import { scopePlot } from "./scope-plot"

/** The plot's drawing box; the SVG stretches it to the panel. */
const PLOT = { width: 1000, height: 200 }
const GRID_DIVISIONS = 10
const TRACE_COLOURS = ["var(--trace-1)", "var(--trace-2)", "var(--trace-3)", "var(--trace-4)"]
const DEGREES_PER_RADIAN = 180 / Math.PI

type Mode = "time" | "frequency"
const colourOf = (index: number) => TRACE_COLOURS[index % TRACE_COLOURS.length] ?? "var(--trace-1)"

/**
 * Oscilloscope: every scope probe's voltage over the last few real seconds of the run, or, when the circuit has an
 * AC source, its frequency response (gain and phase relative to that source, as SPICE's .ac).
 */
@Component({
	selector: "app-scope-view",
	templateUrl: "./scope-view.html",
	styleUrl: "./scope-view.scss",
})
export class ScopeView {
	protected readonly store = inject(CircuitStore)
	private readonly config = inject(UI_CONFIG)
	protected readonly box = PLOT
	protected readonly gridLines = Array.from({ length: GRID_DIVISIONS - 1 }, (_, index) => ((index + 1) * PLOT.width) / GRID_DIVISIONS)
	private readonly chosenMode = signal<Mode>("time")

	private readonly window = computed(() => this.config.scope.windowRealSeconds * this.store.circuit().simulation.speed)

	/** The first AC source drives the frequency view; without one there is only time. */
	protected readonly acInput = computed(() => this.store.circuit().components.find((component) => component.type === "ac-source"))
	protected readonly mode = computed<Mode>(() => (this.acInput() ? this.chosenMode() : "time"))

	protected readonly plot = computed(() => {
		const plot = scopePlot(this.store.scopeSamples(), this.store.scopeProbes(), this.window(), PLOT)
		return {
			traces: plot.traces.map((trace, index) => ({
				...trace,
				colour: colourOf(index),
				latestText: trace.latest === undefined ? "–" : formatSi(trace.latest, "V"),
			})),
			top: formatSi(plot.range.max, "V"),
			bottom: formatSi(plot.range.min, "V"),
			zeroY: plot.range.min < 0 && plot.range.max > 0 ? (plot.range.max / (plot.range.max - plot.range.min)) * PLOT.height : undefined,
			division: formatSi(this.window() / GRID_DIVISIONS, "s"),
		}
	})

	/** Solved only while the frequency view is shown; again on every edit, so a turned dial moves the curve. */
	protected readonly bode = computed(() => {
		const input = this.acInput()
		if (this.mode() !== "frequency" || input?.type !== "ac-source") return undefined
		const { startHz, stopHz, pointsPerDecade } = this.config.bode
		const result = solveAc(this.store.circuit(), { start: startHz, stop: stopHz, pointsPerDecade })
		if (!result.ok) return { error: result.errors.map((issue) => issue.message).join(" ") }
		const phase = input.params.phase / DEGREES_PER_RADIAN
		const phasor = { re: input.params.amplitude * Math.cos(phase), im: input.params.amplitude * Math.sin(phase) }
		const plot = bodePlot(result.points, this.store.scopeProbes(), phasor, PLOT)
		return {
			input: input.id,
			traces: plot.traces.map((trace, index) => ({
				...trace,
				colour: colourOf(index),
				// + 0 turns a rounded −0 into 0, so a flat response reads "0.0 dB", not "-0.0 dB".
				peakText: trace.peak === undefined ? "–" : `${(Math.round(trace.peak * 10) / 10 + 0).toFixed(1)} dB`,
			})),
			decades: plot.decades,
			range: `${formatSi(plot.range.start, "Hz")} to ${formatSi(plot.range.stop, "Hz")}`,
			gain: `${plot.gain.min} to ${plot.gain.max} dB`,
			zeroGainY: (plot.gain.max / (plot.gain.max - plot.gain.min)) * PLOT.height,
		}
	})

	protected show(mode: Mode): void {
		this.chosenMode.set(mode)
	}
}
