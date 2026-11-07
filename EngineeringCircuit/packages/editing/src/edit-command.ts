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

export const editCommandSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("add-component"), component: newComponentSchema }),
	z.strictObject({ type: z.literal("remove-component"), componentId: idSchema }),
	z.strictObject({ type: z.literal("connect"), from: pinRefSchema, to: pinRefSchema }),
	z.strictObject({ type: z.literal("disconnect"), wireId: idSchema }),
	z.strictObject({ type: z.literal("set-parameter"), componentId: idSchema, name: idSchema, value: z.unknown() }),
	z.strictObject({ type: z.literal("move-component"), componentId: idSchema, position: pointSchema }),
	z.strictObject({
		type: z.literal("rotate-component"),
		componentId: idSchema,
		/** The exact angle to turn to; without it the part turns a quarter turn clockwise. */
		rotation: rotationSchema.optional(),
	}),
])
export type EditCommand = z.infer<typeof editCommandSchema>
