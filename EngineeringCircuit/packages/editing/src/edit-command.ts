import { type ComponentType, isComponentType, pinRefSchema, pointSchema, rotationSchema } from "@engineering-circuit/format"
import { z } from "zod"

const idSchema = z.string().min(1)

export const newComponentSchema = z.strictObject({
	id: idSchema.optional(),
	type: z.custom<ComponentType>(isComponentType, "Unknown component type"),
	params: z.record(z.string(), z.unknown()).optional(),
	position: pointSchema.optional(),
	rotation: rotationSchema.optional(),
})
export type NewComponent = z.infer<typeof newComponentSchema>

const singleCommandSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("add-component"), component: newComponentSchema }),
	z.strictObject({ type: z.literal("remove-component"), componentId: idSchema }),
	z.strictObject({ type: z.literal("connect"), from: pinRefSchema, to: pinRefSchema }),
	z.strictObject({ type: z.literal("disconnect"), wireId: idSchema }),
	z.strictObject({ type: z.literal("set-parameter"), componentId: idSchema, name: idSchema, value: z.unknown() }),
	z.strictObject({ type: z.literal("move-component"), componentId: idSchema, position: pointSchema }),
	z.strictObject({ type: z.literal("rename-circuit"), name: z.string() }),
	z.strictObject({
		type: z.literal("add-note"),
		note: z.strictObject({ id: idSchema.optional(), text: z.string(), position: pointSchema.optional() }),
	}),
	z.strictObject({ type: z.literal("edit-note"), noteId: idSchema, text: z.string() }),
	z.strictObject({ type: z.literal("move-note"), noteId: idSchema, position: pointSchema }),
	z.strictObject({ type: z.literal("remove-note"), noteId: idSchema }),
	/** Cuts a wire at `position` and puts a junction there, so another wire can join it. */
	z.strictObject({ type: z.literal("split-wire"), wireId: idSchema, position: pointSchema }),
	z.strictObject({
		type: z.literal("set-simulation"),
		timeStep: z.number().optional(),
		speed: z.number().optional(),
		logicHigh: z.number().optional(),
		temperature: z.number().optional(),
	}),
	z.strictObject({
		type: z.literal("rotate-component"),
		componentId: idSchema,
		/** The exact angle to turn to; without it the part turns a quarter turn clockwise. */
		rotation: rotationSchema.optional(),
	}),
])
type SingleCommand = z.infer<typeof singleCommandSchema>

/** Commands in one batch at most (a batch arrives over the live link too). */
export const MAX_BATCH = 2000

/** A batch applies several commands as one change (one undo step), e.g. a paste or joining a wire. */
export type EditCommand = SingleCommand | { type: "batch"; summary: string; commands: EditCommand[] }

export const editCommandSchema: z.ZodType<EditCommand> = z.union([
	singleCommandSchema,
	z.strictObject({
		type: z.literal("batch"),
		summary: z.string().min(1),
		commands: z.array(z.lazy(() => editCommandSchema)).min(1).max(MAX_BATCH),
	}),
])
