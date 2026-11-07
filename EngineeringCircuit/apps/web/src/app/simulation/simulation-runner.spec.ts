import { createCircuit } from "@engineering-circuit/format"
import { expect, test } from "vitest"
import { kvlExample } from "../circuit/examples"
import { SimulationRunner } from "./simulation-runner"

const rc = () => ({
	...createCircuit("RC"),
	components: [
		{ id: "V1", type: "voltage-source", position: { x: 0, y: 0 }, rotation: 0, params: { voltage: 5 } },
		{ id: "R1", type: "resistor", position: { x: 100, y: 0 }, rotation: 0, params: { resistance: 1000 } },
		{ id: "C1", type: "capacitor", position: { x: 200, y: 0 }, rotation: 0, params: { capacitance: 1e-6 } },
		{ id: "GND1", type: "ground", position: { x: 0, y: 100 }, rotation: 0, params: {} },
	],
	wires: [
		{ id: "w1", from: { componentId: "V1", pin: "positive" }, to: { componentId: "R1", pin: "a" }, bends: [] },
		{ id: "w2", from: { componentId: "R1", pin: "b" }, to: { componentId: "C1", pin: "a" }, bends: [] },
		{ id: "w3", from: { componentId: "C1", pin: "b" }, to: { componentId: "GND1", pin: "terminal" }, bends: [] },
		{ id: "w4", from: { componentId: "V1", pin: "negative" }, to: { componentId: "GND1", pin: "terminal" }, bends: [] },
	],
}) satisfies ReturnType<typeof createCircuit>

const voltageOf = (frame: ReturnType<SimulationRunner["handle"]>) =>
	frame?.result.ok ? (frame.result.solution.readings["C1"]?.voltage ?? Number.NaN) : Number.NaN

test("advancing runs whole time steps and carries the remainder to the next frame", () => {
	const runner = new SimulationRunner()
	runner.handle({ type: "load", circuit: rc(), circuitId: 1 })
	const first = runner.handle({ type: "advance", seconds: 12e-6, maxSteps: 1000 })
	expect(first).toMatchObject({ type: "frame", circuitId: 1, slowed: false })
	expect(first?.time).toBeCloseTo(10e-6, 12)
	const second = runner.handle({ type: "advance", seconds: 3e-6, maxSteps: 1000 })
	expect(second?.time).toBeCloseTo(15e-6, 12)
})

test("one millisecond in, the capacitor holds 63% of the supply", () => {
	const runner = new SimulationRunner()
	runner.handle({ type: "load", circuit: rc(), circuitId: 1 })
	expect(voltageOf(runner.handle({ type: "advance", seconds: 1e-3, maxSteps: 1000 }))).toBeCloseTo(3.1606, 3)
})

test("too many steps for one frame are capped and reported as slowed", () => {
	const runner = new SimulationRunner()
	runner.handle({ type: "load", circuit: rc(), circuitId: 1 })
	const frame = runner.handle({ type: "advance", seconds: 1, maxSteps: 10 })
	expect(frame?.slowed).toBe(true)
	expect(frame?.time).toBeCloseTo(50e-6, 12)
})

test("restart empties the capacitor and resets the clock", () => {
	const runner = new SimulationRunner()
	runner.handle({ type: "load", circuit: rc(), circuitId: 1 })
	runner.handle({ type: "advance", seconds: 1e-3, maxSteps: 1000 })
	runner.handle({ type: "restart" })
	const frame = runner.handle({ type: "advance", seconds: 5e-6, maxSteps: 1000 })
	expect(frame?.time).toBeCloseTo(5e-6, 12)
	expect(voltageOf(frame)).toBeLessThan(0.1)
})

test("a reloaded circuit keeps running from the same state", () => {
	const runner = new SimulationRunner()
	runner.handle({ type: "load", circuit: rc(), circuitId: 1 })
	runner.handle({ type: "advance", seconds: 1e-3, maxSteps: 1000 })
	runner.handle({ type: "load", circuit: rc(), circuitId: 2 })
	const frame = runner.handle({ type: "advance", seconds: 5e-6, maxSteps: 1000 })
	expect(frame?.circuitId).toBe(2)
	expect(voltageOf(frame)).toBeGreaterThan(3)
})

test("nothing to report before a circuit is loaded; errors come back as results", () => {
	const runner = new SimulationRunner()
	expect(runner.handle({ type: "advance", seconds: 1e-3, maxSteps: 10 })).toBeUndefined()
	const shorted = kvlExample()
	shorted.wires.push({ id: "w9", from: { componentId: "V1", pin: "positive" }, to: { componentId: "V1", pin: "negative" }, bends: [] })
	runner.handle({ type: "load", circuit: shorted, circuitId: 3 })
	const frame = runner.handle({ type: "advance", seconds: 1e-3, maxSteps: 10 })
	expect(frame?.result.ok).toBe(false)
})
