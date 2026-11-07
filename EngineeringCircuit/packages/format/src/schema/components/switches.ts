import { z } from "zod"
import { defineComponent } from "./define"

export const SWITCHES = [
	defineComponent("switch", {
		idPrefix: "S",
		pins: ["a", "b"],
		params: { closed: z.boolean().describe("true = conducting") },
	}),
] as const
