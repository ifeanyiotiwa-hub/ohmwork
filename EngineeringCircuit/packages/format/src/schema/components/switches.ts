import { z } from "zod"
import { defineComponent } from "./define"

export const SWITCHES = [
	defineComponent("switch", {
		idPrefix: "S",
		pins: ["a", "b"],
		params: { closed: z.boolean().describe("true = conducting") },
		defaults: { closed: true },
	}),
	defineComponent("push-button", {
		idPrefix: "PB",
		pins: ["a", "b"],
		params: {
			normallyOpen: z
				.boolean()
				.describe("true = conducts only while pressed (normally open); false = conducts until pressed (normally closed)"),
		},
		defaults: { normallyOpen: true },
	}),
] as const
