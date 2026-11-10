/// <reference lib="webworker" />
import type { ToWorker } from "./simulation-protocol"
import { SimulationRunner } from "./simulation-runner"

const runner = new SimulationRunner()

addEventListener("message", ({ data }: MessageEvent<ToWorker>) => {
	const reply = runner.handle(data)
	if (reply) postMessage(reply)
})
