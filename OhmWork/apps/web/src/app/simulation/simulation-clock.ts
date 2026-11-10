import { Injectable, inject, signal } from "@angular/core"
import type { Circuit } from "@ohmwork/format"
import { UI_CONFIG } from "../circuit/ui-config"
import type { FromWorker, ScopeSample, ToWorker } from "./simulation-protocol"

/**
 * Runs the time simulation in a Web Worker, one request per animation frame: real seconds since the last
 * request × the circuit's speed. Only one request is in flight; time that passes meanwhile is added to the next.
 */
@Injectable({ providedIn: "root" })
export class SimulationClock {
	private readonly config = inject(UI_CONFIG)
	readonly frame = signal<FromWorker | undefined>(undefined)
	/** Recent scope probe samples, oldest first, bounded by the scope window and `maxSamples`. */
	readonly samples = signal<readonly ScopeSample[]>([])
	/** Set if the worker itself failed (a bug, not a circuit problem). */
	readonly failure = signal<string | undefined>(undefined)

	private worker: Worker | undefined
	private watched: string[] = []
	private circuit: Circuit | undefined
	private running = true
	private waiting = false
	private pendingSeconds = 0
	private lastTick: number | undefined
	private animation: number | undefined

	/** The circuit to run, or undefined when nothing in it changes over time (the clock then stops). */
	load(circuit: Circuit | undefined, circuitId: number): void {
		this.circuit = circuit
		if (!circuit) {
			this.stop()
			return
		}
		this.post({ type: "load", circuit, circuitId })
		this.start()
	}

	press(pressed: readonly string[]): void {
		if (this.worker) this.post({ type: "press", pressed: [...pressed] })
	}

	/** Parts to sample besides the scope probes. Sent before the circuit too, since the worker starts with none. */
	watch(ids: readonly string[]): void {
		this.watched = [...ids]
		if (this.worker) this.post({ type: "watch", ids: this.watched })
	}

	restart(): void {
		this.samples.set([])
		if (!this.worker) return
		this.post({ type: "restart" })
		this.pendingSeconds = 0
	}

	setRunning(running: boolean): void {
		this.running = running
		if (running) this.start()
		else this.stop()
	}

	private start(): void {
		if (!this.running || !this.circuit || this.animation !== undefined) return
		this.lastTick = undefined
		this.animation = requestAnimationFrame(this.tick)
	}

	private stop(): void {
		if (this.animation !== undefined) cancelAnimationFrame(this.animation)
		this.animation = undefined
	}

	private readonly tick = (now: number): void => {
		this.animation = requestAnimationFrame(this.tick)
		const realSeconds = this.lastTick === undefined ? 0 : (now - this.lastTick) / 1000
		this.lastTick = now
		this.pendingSeconds = Math.min(this.pendingSeconds + realSeconds, this.config.simulation.maxFrameSeconds)
		const circuit = this.circuit
		if (this.waiting || !circuit || this.pendingSeconds === 0) return

		this.waiting = true
		this.post({
			type: "advance",
			seconds: this.pendingSeconds * circuit.simulation.speed,
			maxSteps: this.config.simulation.maxStepsPerFrame,
		})
		this.pendingSeconds = 0
	}

	/** Keeps `historyWindows` scope windows, so a triggered view has a whole window after its trigger point. */
	private record(fresh: readonly ScopeSample[], now: number): void {
		const window = this.config.scope.windowRealSeconds * this.config.scope.historyWindows * (this.circuit?.simulation.speed ?? 0)
		this.samples.update((previous) =>
			[...previous, ...fresh].filter((sample) => sample.time >= now - window).slice(-this.config.scope.maxSamples),
		)
	}

	private post(message: ToWorker): void {
		this.workerInstance().postMessage(message)
	}

	private workerInstance(): Worker {
		if (this.worker) return this.worker
		const worker = new Worker(new URL("./simulation.worker", import.meta.url), { type: "module" })
		worker.postMessage({ type: "watch", ids: this.watched } satisfies ToWorker)
		worker.addEventListener("message", ({ data }: MessageEvent<FromWorker>) => {
			this.waiting = false
			this.frame.set(data)
			if (data.samples.length > 0) this.record(data.samples, data.time)
		})
		worker.addEventListener("error", (event) => {
			this.waiting = false
			this.failure.set(`The simulation stopped unexpectedly: ${event.message}`)
		})
		this.worker = worker
		return worker
	}
}
