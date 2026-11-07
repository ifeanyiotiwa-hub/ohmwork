import { z } from "zod"
import { defineComponent, positive } from "./define"

export const SWITCHES = [
	defineComponent("switch", {
		idPrefix: "S",
		pins: ["a", "b"],
		params: { closed: z.boolean().describe("true = conducting") },
		defaults: { closed: true },
	}),
	defineComponent("switch-spdt", {
		idPrefix: "SW",
		pins: ["common", "a", "b"],
		params: { position: z.enum(["a", "b"]).describe("which pin the common pin is connected to") },
		defaults: { position: "a" },
	}),
	// CircuitJS1 RelayModel "default": 0.2 H, 20 Ω coil; pulls in above 20 mA, drops out below 15 mA.
	defineComponent("relay", {
		idPrefix: "RLY",
		pins: ["coilA", "coilB", "common", "normallyOpen", "normallyClosed"],
		params: {
			coilInductance: positive("henries"),
			coilResistance: positive("ohms"),
			onCurrent: positive("amps through the coil to pull the switch over"),
			offCurrent: positive("amps below which it drops back (less than onCurrent)"),
		},
		defaults: { coilInductance: 0.2, coilResistance: 20, onCurrent: 0.02, offCurrent: 0.015 },
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
