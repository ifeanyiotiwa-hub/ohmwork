import { z } from "zod"

export const pointSchema = z.strictObject({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof pointSchema>

export const rotationSchema = z.literal([0, 90, 180, 270])
