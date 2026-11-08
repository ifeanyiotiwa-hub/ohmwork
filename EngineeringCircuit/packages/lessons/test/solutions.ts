import type { Circuit } from "@engineering-circuit/format"
import { build } from "./build"

const LED = { color: "red", saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 } as const
const TRANSISTOR = { beta: 100, betaReverse: 1, saturationCurrent: 1e-13 }

/** A correct circuit for each starter lesson, as a learner might build it. */
export const SOLUTIONS: Record<string, Circuit> = {
	"light-an-led": build(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 220 } },
			{ id: "LED1", type: "led", params: LED },
			{ id: "GND1", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "LED1.anode"], ["LED1.cathode", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
	),
	"voltage-divider": build(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "R2", type: "resistor", params: { resistance: 1000 } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "R2.a"], ["R2.b", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
	),
	"rc-charging": build(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 1000 } },
			{ id: "C1", type: "capacitor", params: { capacitance: 1e-6 } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[["V1.positive", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "GND1.terminal"], ["V1.negative", "GND1.terminal"]],
	),
	"transistor-switch": build(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
			{ id: "R1", type: "resistor", params: { resistance: 220 } },
			{ id: "LED1", type: "led", params: LED },
			{ id: "Q1", type: "npn-transistor", params: TRANSISTOR },
			{ id: "PB1", type: "push-button", params: { normallyOpen: true } },
			{ id: "R2", type: "resistor", params: { resistance: 10000 } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[
			["V1.positive", "R1.a"],
			["R1.b", "LED1.anode"],
			["LED1.cathode", "Q1.collector"],
			["Q1.emitter", "GND1.terminal"],
			["V1.negative", "GND1.terminal"],
			["V1.positive", "PB1.a"],
			["PB1.b", "R2.a"],
			["R2.b", "Q1.base"],
		],
	),
	"half-adder": build(
		[
			{ id: "IN1", type: "logic-input", params: { high: false } },
			{ id: "IN2", type: "logic-input", params: { high: false } },
			{ id: "XOR1", type: "xor-gate", params: {} },
			{ id: "AND1", type: "and-gate", params: {} },
			// Outputs in the "wrong" order on purpose: the check matches columns, not ids.
			{ id: "OUT1", type: "logic-output", params: {} },
			{ id: "OUT2", type: "logic-output", params: {} },
		],
		[
			["IN1.out", "XOR1.a"],
			["IN2.out", "XOR1.b"],
			["IN1.out", "AND1.a"],
			["IN2.out", "AND1.b"],
			["AND1.out", "OUT1.in"],
			["XOR1.out", "OUT2.in"],
		],
	),
}
