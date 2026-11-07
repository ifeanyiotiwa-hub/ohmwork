import { z } from "zod"
import { defineComponent } from "./define"

export const SEMICONDUCTORS = [
	defineComponent("diode", { pins: ["anode", "cathode"], params: {} }),
	defineComponent("led", {
		pins: ["anode", "cathode"],
		params: { color: z.enum(["red", "green", "blue", "yellow", "white"]) },
	}),
] as const
