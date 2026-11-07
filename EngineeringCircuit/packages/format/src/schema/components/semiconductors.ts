import { z } from "zod"
import { defineComponent } from "./define"

export const SEMICONDUCTORS = [
	defineComponent("diode", { idPrefix: "D", pins: ["anode", "cathode"], params: {} }),
	defineComponent("led", {
		idPrefix: "LED",
		pins: ["anode", "cathode"],
		params: { color: z.enum(["red", "green", "blue", "yellow", "white"]) },
	}),
] as const
