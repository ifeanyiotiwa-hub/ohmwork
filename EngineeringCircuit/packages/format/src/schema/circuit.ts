import * as z from "zod"
import { componentSchema } from "./components/catalog"
import { pointSchema } from "./geometry"

export const FORMAT_ID = "engineering-circuit"
export const CURRENT_VERSION = 11

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
	temperature: z.number().gt(-273.15).describe("degrees Celsius of every part (diodes and transistors change with it; SPICE nominal is 27)"),
	stepping: z
		.enum(["fixed", "adaptive"])
		.describe("adaptive: steps as small as accuracy needs, up to the time step; fixed: always the time step (circuits with logic always step fixed)"),
})
export type SimulationSettings = z.infer<typeof simulationSchema>

/** CircuitJS1's default time step and 5 V logic; speed shows a 40 Hz wave at 0.4 cycles per second. */
export const DEFAULT_SIMULATION: SimulationSettings = { timeStep: 5e-6, speed: 0.01, logicHigh: 5, temperature: 27, stepping: "adaptive" }

/** Longest text a note may hold. */
export const MAX_NOTE_LENGTH = 1000

/** A text note on the canvas, written by the learner or the agent (separate from the circuit's parts). */
export const noteSchema = z.strictObject({
	id: z.string().min(1),
	position: pointSchema,
	text: z.string().min(1).max(MAX_NOTE_LENGTH),
})
export type Note = z.infer<typeof noteSchema>

/** Pins a chip may have at most. */
export const MAX_CHIP_PINS = 16

/**
 * A chip (SPICE subcircuit): parts and wires of their own, and pins that each stand for one pin inside. Placed as a
 * `subcircuit` part naming it; the engine sees its parts, renamed "<chip id>.<part id>" (expandSubcircuits).
 */
export const subcircuitSchema = z.strictObject({
	id: z.string().regex(/^[a-z][a-z0-9-]*$/, "a chip id is lowercase letters, digits and dashes"),
	name: z.string().min(1).max(40),
	pins: z
		.array(z.strictObject({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,15}$/, "a pin name is a letter then letters, digits or _"), to: pinRefSchema }))
		.min(1)
		.max(MAX_CHIP_PINS),
	components: z.array(componentSchema),
	wires: z.array(wireSchema),
})
export type Subcircuit = z.infer<typeof subcircuitSchema>

export const circuitSchema = z.strictObject({
	format: z.literal(FORMAT_ID),
	version: z.literal(CURRENT_VERSION),
	name: z.string(),
	description: z.string(),
	simulation: simulationSchema,
	/** The lesson this circuit is an attempt at, if any (a lesson id). */
	lesson: z.string().min(1).optional(),
	notes: z.array(noteSchema),
	components: z.array(componentSchema),
	wires: z.array(wireSchema),
	subcircuits: z.array(subcircuitSchema),
})
export type Circuit = z.infer<typeof circuitSchema>

export const createCircuit = (name: string): Circuit => ({
	format: FORMAT_ID,
	version: CURRENT_VERSION,
	name,
	description: "",
	simulation: { ...DEFAULT_SIMULATION },
	notes: [],
	components: [],
	wires: [],
	subcircuits: [],
})
