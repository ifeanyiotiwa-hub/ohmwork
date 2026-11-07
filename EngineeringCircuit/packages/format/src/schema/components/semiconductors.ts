import { z } from "zod"
import { defineComponent } from "./define"

export const SEMICONDUCTORS = [
	defineComponent("diode", { idPrefix: "D", pins: ["anode", "cathode"], params: {}, defaults: {} }),
	defineComponent("led", {
		idPrefix: "LED",
		pins: ["anode", "cathode"],
		params: { color: z.enum(["red", "green", "blue", "yellow", "white"]) },
		defaults: { color: "red" },
	}),
] as const
