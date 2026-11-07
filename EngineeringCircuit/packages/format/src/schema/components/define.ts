import { z } from "zod"
import { pointSchema, rotationSchema } from "../geometry"

export const positive = (unit: string) => z.number().positive().describe(unit)

type Definition<Pins, Params extends z.ZodRawShape> = {
	idPrefix: string
	pins: Pins
	params: Params
	defaults: z.output<z.ZodObject<Params>>
}

export function defineComponent<
	Type extends string,
	const Pins extends readonly [string, ...string[]],
	Params extends z.ZodRawShape,
>(type: Type, { idPrefix, pins, params, defaults }: Definition<Pins, Params>) {
	return {
		type,
		idPrefix,
		pins,
		defaults,
		schema: z.strictObject({
			id: z.string().min(1),
			type: z.literal(type),
			position: pointSchema,
			rotation: rotationSchema,
			params: z.strictObject(params),
		}),
	}
}
