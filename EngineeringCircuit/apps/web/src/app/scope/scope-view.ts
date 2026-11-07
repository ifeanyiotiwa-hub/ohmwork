import { Component, computed, inject } from "@angular/core"
import { CircuitStore } from "../circuit/circuit-store"
import { formatSi } from "../circuit/si-units"
import { UI_CONFIG } from "../circuit/ui-config"
import { scopePlot } from "./scope-plot"

/** The plot's drawing box; the SVG stretches it to the panel. */
const PLOT = { width: 1000, height: 200 }
const GRID_DIVISIONS = 10
const TRACE_COLOURS = ["var(--trace-1)", "var(--trace-2)", "var(--trace-3)", "var(--trace-4)"]

/** Oscilloscope: every scope probe's voltage over the last few real seconds of the run. */
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

	private readonly window = computed(() => this.config.scope.windowRealSeconds * this.store.circuit().simulation.speed)

	protected readonly plot = computed(() => {
		const plot = scopePlot(this.store.scopeSamples(), this.store.scopeProbes(), this.window(), PLOT)
		return {
			traces: plot.traces.map((trace, index) => ({
				...trace,
				colour: TRACE_COLOURS[index % TRACE_COLOURS.length] ?? "var(--trace-1)",
				latestText: trace.latest === undefined ? "–" : formatSi(trace.latest, "V"),
			})),
			top: formatSi(plot.range.max, "V"),
			bottom: formatSi(plot.range.min, "V"),
			zeroY: plot.range.min < 0 && plot.range.max > 0 ? (plot.range.max / (plot.range.max - plot.range.min)) * PLOT.height : undefined,
			division: formatSi(this.window() / GRID_DIVISIONS, "s"),
		}
	})
}
