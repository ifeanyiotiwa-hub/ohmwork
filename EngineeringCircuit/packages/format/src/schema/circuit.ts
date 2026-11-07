import { z } from "zod"
import { componentSchema } from "./components/catalog"
import { pointSchema } from "./geometry"

export const FORMAT_ID = "engineering-circuit"
export const CURRENT_VERSION = 1

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

export const circuitSchema = z.strictObject({
	format: z.literal(FORMAT_ID),
	version: z.literal(CURRENT_VERSION),
	name: z.string(),
	description: z.string(),
	components: z.array(componentSchema),
	wires: z.array(wireSchema),
})
export type Circuit = z.infer<typeof circuitSchema>

export const createCircuit = (name: string): Circuit => ({
	format: FORMAT_ID,
	version: CURRENT_VERSION,
	name,
	description: "",
	components: [],
	wires: [],
})
