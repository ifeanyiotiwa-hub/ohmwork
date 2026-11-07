import { z } from "zod"
import { pointSchema, rotationSchema } from "../geometry"

export const positive = (unit: string) => z.number().positive().describe(unit)

type Definition<Pins, Params> = { pins: Pins; params: Params }

export function defineComponent<
	Type extends string,
	const Pins extends readonly [string, ...string[]],
	Params extends z.ZodRawShape,
>(type: Type, { pins, params }: Definition<Pins, Params>) {
	return {
		type,
		pins,
		schema: z.strictObject({
			id: z.string().min(1),
			type: z.literal(type),
			position: pointSchema,
			rotation: rotationSchema,
			params: z.strictObject(params),
		}),
	}
}
