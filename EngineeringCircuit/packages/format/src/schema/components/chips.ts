import * as z from "zod"
import { defineComponent } from "./define"

/**
 * A placed chip. Its pins come from its definition in the circuit's `subcircuits` (pinsOfPart), not from the type, so
 * it is the one part with none of its own; it is in no palette category (the palette lists the circuit's chips).
 */
export const CHIPS = [
	defineComponent("subcircuit", {
		idPrefix: "X",
		pins: [],
		params: { definition: z.string().min(1).describe("the id of the chip in the circuit's subcircuits") },
		defaults: { definition: "chip" },
	}),
] as const
