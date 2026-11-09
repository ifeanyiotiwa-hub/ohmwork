import * as z from "zod"
import { defineComponent, positive } from "./define"

/** Characters in a net label's or a bus's name. */
export const NET_LABEL_MAX_LENGTH = 24

const nameSchema = (description: string) =>
	z.string().max(NET_LABEL_MAX_LENGTH).regex(/\S/, "needs a name").describe(description)

/**
 * A bus connector: its pins d0… are the members of the bus named `name`, so connectors of one name join pin by pin
 * (d3 to d3), and a net label named after a member ("D3") taps it. Fixed widths, as a part's pins never change with a
 * setting (ADR-009): 4 and 8, the widths of the counters and converters.
 */
const busConnector = <Type extends string>(type: Type, pins: readonly [string, ...string[]], idPrefix: string) =>
	defineComponent(type, {
		idPrefix,
		pins,
		params: { name: nameSchema("bus name: connectors with the same name join pin by pin; a net label named <name><n> taps member n") },
		defaults: { name: "D" },
	})

export const PASSIVES = [
	defineComponent("resistor", {
		idPrefix: "R",
		pins: ["a", "b"],
		params: {
			resistance: positive("ohms"),
			powerRating: positive("watts it can turn into heat safely; more is reported as burning it out"),
		},
		// The common through-hole resistor is ¼ W.
		defaults: { resistance: 1000, powerRating: 0.25 },
	}),
	// A connection point in the middle of wiring: any number of wires meet at its one pin.
	defineComponent("junction", { idPrefix: "J", pins: ["terminal"], params: {}, defaults: {} }),
	// A named node (SPICE node name): every pin wired to a label of the same name is one node, with no wire between.
	defineComponent("net-label", {
		idPrefix: "NL",
		pins: ["terminal"],
		params: { name: nameSchema("labels with the same name are connected (spaces and capitals don't matter)") },
		defaults: { name: "A" },
	}),
	// Prefixes as the wide gates: Q for quad, O for octal.
	busConnector("bus-4", ["d0", "d1", "d2", "d3"], "BUSQ"),
	busConnector("bus-8", ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"], "BUSO"),
	defineComponent("capacitor", {
		idPrefix: "C",
		pins: ["a", "b"],
		params: { capacitance: positive("farads") },
		defaults: { capacitance: 1e-6 },
	}),
	defineComponent("inductor", {
		idPrefix: "L",
		pins: ["a", "b"],
		params: { inductance: positive("henries") },
		defaults: { inductance: 1e-3 },
	}),
	// Defaults below follow CircuitJS1 (PolarCapacitorElm, PotElm, TransformerElm) except the lamp; see COMPONENTS.md.
	defineComponent("polarized-capacitor", {
		idPrefix: "CP",
		pins: ["positive", "negative"],
		params: {
			capacitance: positive("farads"),
			maxReverseVoltage: z.number().nonnegative().describe("volts the negative pin may sit above the positive one"),
		},
		defaults: { capacitance: 1e-5, maxReverseVoltage: 1 },
	}),
	defineComponent("potentiometer", {
		idPrefix: "POT",
		pins: ["a", "b", "wiper"],
		params: {
			resistance: positive("ohms, end to end"),
			position: z.number().min(0).max(1).describe("wiper position from pin a (0) to pin b (1)"),
		},
		defaults: { resistance: 1000, position: 0.5 },
	}),
	defineComponent("lamp", {
		idPrefix: "LMP",
		pins: ["a", "b"],
		params: { ratedVoltage: positive("volts"), ratedPower: positive("watts at the rated voltage") },
		defaults: { ratedVoltage: 6, ratedPower: 1 },
	}),
	// FAULHABER 2224U012SR (datasheet "Series 2224 ... SR", 012 SR column, at 22 °C): terminal resistance 8.77 Ω, rotor
	// inductance 203 µH, torque constant 14.6 mNm/A (in SI also the back-EMF constant, V·s/rad: its speed constant
	// 655 rpm/V agrees), rotor inertia 2.7 g·cm². Its friction torque, 0.2 mNm, is modelled as viscous damping that
	// gives that torque at the no-load speed (7810 rpm), so the no-load current comes out at its 13.8 mA within 2%.
	defineComponent("dc-motor", {
		idPrefix: "MOT",
		pins: ["a", "b"],
		params: {
			resistance: positive("ohms, winding resistance"),
			inductance: positive("henries, winding inductance"),
			torqueConstant: positive("newton-metres per amp; also the back-EMF in volts per radian per second"),
			inertia: positive("kilogram square metres, rotor and load inertia (1 g·cm² = 1e-7)"),
			damping: positive("newton-metre-seconds, friction torque per radian per second of speed"),
		},
		defaults: {
			resistance: 8.77,
			inductance: 203e-6,
			torqueConstant: 0.0146,
			inertia: 2.7e-7,
			damping: 0.2e-3 / ((7810 * 2 * Math.PI) / 60),
		},
	}),
	defineComponent("transformer", {
		idPrefix: "T",
		pins: ["primaryA", "primaryB", "secondaryA", "secondaryB"],
		params: {
			primaryInductance: positive("henries"),
			turnsRatio: positive("secondary turns per primary turn"),
			coupling: z.number().gt(0).lt(1).describe("coupling coefficient, between 0 and 1 (1 itself is not allowed)"),
		},
		defaults: { primaryInductance: 4, turnsRatio: 1, coupling: 0.999 },
	}),
	// CircuitJS1 TappedTransformerElm: the secondary split at a centre tap (for full-wave rectifiers and ± supplies).
	defineComponent("tapped-transformer", {
		idPrefix: "TT",
		pins: ["primaryA", "primaryB", "secondaryA", "secondaryTap", "secondaryB"],
		params: {
			primaryInductance: positive("henries"),
			turnsRatio: positive("whole-secondary turns per primary turn (each half has half of them)"),
			coupling: z.number().gt(0).lt(1).describe("coupling coefficient between every pair of windings, between 0 and 1 (1 itself is not allowed)"),
		},
		defaults: { primaryInductance: 4, turnsRatio: 2, coupling: 0.999 },
	}),
] as const
