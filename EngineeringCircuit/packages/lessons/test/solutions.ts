import type { Circuit } from "@ohmwork/format"
import { build } from "./build"

const LED = { color: "red", saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 } as const
const TRANSISTOR = { beta: 100, betaReverse: 1, saturationCurrent: 1e-13 }

/** A 555 astable on 9 V, its output driving an LED through 470 Ω. */
export const astable = (r1: number, r2: number, capacitance: number) =>
	build(
		[
			{ id: "VR1", type: "voltage-rail", params: { voltage: 9 } },
			{ id: "R1", type: "resistor", params: { resistance: r1 } },
			{ id: "R2", type: "resistor", params: { resistance: r2 } },
			{ id: "C1", type: "capacitor", params: { capacitance } },
			{ id: "IC1", type: "timer-555", params: {} },
			{ id: "R3", type: "resistor", params: { resistance: 470 } },
			{ id: "LED1", type: "led", params: LED },
			{ id: "GND1", type: "ground", params: {} },
		],
		[
			["VR1.terminal", "IC1.vcc"],
			["VR1.terminal", "IC1.reset"],
			["VR1.terminal", "R1.a"],
			["R1.b", "IC1.discharge"],
			["IC1.discharge", "R2.a"],
			["R2.b", "IC1.threshold"],
			["IC1.threshold", "IC1.trigger"],
			["IC1.trigger", "C1.a"],
			["C1.b", "GND1.terminal"],
			["IC1.ground", "GND1.terminal"],
			["IC1.output", "R3.a"],
			["R3.b", "LED1.anode"],
			["LED1.cathode", "GND1.terminal"],
		],
	)

/** A non-inverting op-amp amplifier of a 0.2 V source: gain 1 + feedback ÷ ground resistor. */
export const amplifier = (feedback: number, toGround: number) =>
	build(
		[
			{ id: "V1", type: "voltage-source", params: { voltage: 0.2 } },
			{ id: "U1", type: "op-amp", params: {} },
			{ id: "RF", type: "resistor", params: { resistance: feedback } },
			{ id: "RG", type: "resistor", params: { resistance: toGround } },
			{ id: "GND1", type: "ground", params: {} },
		],
		[
			["V1.positive", "U1.nonInverting"],
			["U1.output", "RF.a"],
			["RF.b", "U1.inverting"],
			["U1.inverting", "RG.a"],
			["RG.b", "GND1.terminal"],
			["V1.negative", "GND1.terminal"],
		],
	)

/** An RC low-pass fed by an AC source, a scope probe across the capacitor. */
export const lowPass = (resistance: number, capacitance: number) =>
	build(
		[
			{ id: "AC1", type: "ac-source", params: { amplitude: 1, frequency: 1000, offset: 0, phase: 0, delay: 0 } },
			{ id: "R1", type: "resistor", params: { resistance } },
			{ id: "C1", type: "capacitor", params: { capacitance } },
			{ id: "P1", type: "scope-probe", params: {} },
			{ id: "GND1", type: "ground", params: {} },
		],
		[
			["AC1.positive", "R1.a"],
			["R1.b", "C1.a"],
			["C1.b", "GND1.terminal"],
			["AC1.negative", "GND1.terminal"],
			["C1.a", "P1.positive"],
			["P1.negative", "GND1.terminal"],
		],
	)

/** A clock into a T flip-flop with T held high, Q on a logic output (or, `direct`, the clock straight on it). */
export const halvedClock = (direct = false) =>
	build(
		[
			{ id: "CLK1", type: "clock", params: { frequency: 10 } },
			{ id: "IN1", type: "logic-input", params: { high: true } },
			{ id: "FF1", type: "t-flip-flop", params: {} },
			{ id: "OUT1", type: "logic-output", params: {} },
		],
		[["IN1.out", "FF1.t"], ["CLK1.out", "FF1.clk"], direct ? ["CLK1.out", "OUT1.in"] : ["FF1.q", "OUT1.in"]],
	)

/** A correct circuit for each lesson and challenge, as a learner might build it. */
export const SOLUTIONS: Record<string, Circuit> = {
	"op-amp-amplifier": amplifier(9000, 1000),
	"clock-divider": halvedClock(),
	"timer-555-blinker": astable(1000, 68000, 1e-6),
	// 1.44 ÷ ((10 kΩ + 2 × 68 kΩ) × 10 µF) ≈ 0.99 Hz.
	"blink-once-a-second": astable(10000, 68000, 10e-6),
	// Corner 1 ÷ (2π × 1 kΩ × 159 nF) ≈ 1 kHz.
	"low-pass-filter": lowPass(1000, 159e-9),
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
