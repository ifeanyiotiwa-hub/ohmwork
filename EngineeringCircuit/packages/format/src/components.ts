import { z } from "zod"

export const pointSchema = z.strictObject({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof pointSchema>

const rotationSchema = z.literal([0, 90, 180, 270])

const positive = (unit: string) => z.number().positive().describe(unit)

const component = <Type extends string, Params extends z.ZodRawShape>(type: Type, params: Params) =>
  z.strictObject({
    id: z.string().min(1),
    type: z.literal(type),
    position: pointSchema,
    rotation: rotationSchema,
    params: z.strictObject(params),
  })

export const componentSchema = z.discriminatedUnion("type", [
  component("ground", {}),
  component("voltage-source", { voltage: z.number().describe("volts") }),
  component("current-source", { current: z.number().describe("amps") }),
  component("resistor", { resistance: positive("ohms") }),
  component("capacitor", { capacitance: positive("farads") }),
  component("inductor", { inductance: positive("henries") }),
  component("switch", { closed: z.boolean() }),
  component("diode", {}),
  component("led", { color: z.enum(["red", "green", "blue", "yellow", "white"]) }),
])

export type Component = z.infer<typeof componentSchema>
export type ComponentType = Component["type"]

export const COMPONENT_PINS = {
  ground: ["terminal"],
  "voltage-source": ["positive", "negative"],
  "current-source": ["positive", "negative"],
  resistor: ["a", "b"],
  capacitor: ["a", "b"],
  inductor: ["a", "b"],
  switch: ["a", "b"],
  diode: ["anode", "cathode"],
  led: ["anode", "cathode"],
} as const satisfies Record<ComponentType, readonly string[]>

export const pinsOf = (type: ComponentType): readonly string[] => COMPONENT_PINS[type]
