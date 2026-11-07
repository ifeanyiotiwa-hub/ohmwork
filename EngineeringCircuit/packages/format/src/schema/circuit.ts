import { z } from "zod"
import { componentSchema } from "./components/catalog"
import { pointSchema } from "./geometry"

export const FORMAT_ID = "engineering-circuit"
export const CURRENT_VERSION = 4

export const pinRefSchema = z.strictObject({
	componentId: z.string().min(1),
	pin: z.string().min(1),
})
export type PinRef = z.infer<typeof pinRefSchema>

export const wireSchema = z.strictObject({
	id: z.string().min(1),
	from: pinRefSchema,
	to: pinRefSchema,
	bends: z.array(pointSchema),
})
export type Wire = z.infer<typeof wireSchema>

/** How time runs: each step advances `timeStep` simulated seconds; `speed` is simulated seconds per real second. */
export const simulationSchema = z.strictObject({
	timeStep: z.number().positive().describe("seconds"),
	speed: z.number().positive().describe("simulated seconds per real second"),
	logicHigh: z.number().positive().describe("volts for logic 1; inputs read 1 above half of it"),
})
export type SimulationSettings = z.infer<typeof simulationSchema>

/** CircuitJS1's default time step and 5 V logic; speed shows a 40 Hz wave at 0.4 cycles per second. */
export const DEFAULT_SIMULATION: SimulationSettings = { timeStep: 5e-6, speed: 0.01, logicHigh: 5 }

export const circuitSchema = z.strictObject({
	format: z.literal(FORMAT_ID),
	version: z.literal(CURRENT_VERSION),
	name: z.string(),
	description: z.string(),
	simulation: simulationSchema,
	components: z.array(componentSchema),
	wires: z.array(wireSchema),
})
export type Circuit = z.infer<typeof circuitSchema>

export const createCircuit = (name: string): Circuit => ({
	format: FORMAT_ID,
	version: CURRENT_VERSION,
	name,
	description: "",
	simulation: { ...DEFAULT_SIMULATION },
	components: [],
	wires: [],
})
