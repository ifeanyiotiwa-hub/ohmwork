import * as z from "zod"
import { defineComponent, positive } from "./define"

export const ICS = [
	// CircuitJS1 OpAmpElm: gain 100000, output limited to ±15 V. Supply is implied (no supply pins).
	defineComponent("op-amp", {
		idPrefix: "U",
		pins: ["nonInverting", "inverting", "output"],
		params: {
			gain: positive("ratio, open-loop gain"),
			supplyHigh: z.number().describe("volts, the highest the output can go"),
			supplyLow: z.number().describe("volts, the lowest the output can go"),
			gainBandwidth: positive("hertz, gain × bandwidth: the frequency where its gain falls to 1"),
			slewRate: positive("volts per second the output can change at most (0.5 V/µs = 500000)"),
			maxOutputCurrent: positive("amps the output can deliver at most (short-circuit current)"),
		},
		// Gain and swing: CircuitJS1 OpAmpElm. Dynamics and output current: LM741 (TI SNOSC25D, Oct 2015): slew 0.5 V/µs,
		// short-circuit current 25 mA, unity-gain rise time 0.3 µs, so gain-bandwidth 0.35 / 0.3 µs (its own formula).
		defaults: { gain: 100000, supplyHigh: 15, supplyLow: -15, gainBandwidth: 0.35 / 0.3e-6, slewRate: 0.5e6, maxOutputCurrent: 0.025 },
	}),
	// CircuitJS1 TimerElm (a 555): internal 5 kΩ / 10 kΩ divider puts control at ⅔ of vcc.
	defineComponent("timer-555", {
		idPrefix: "IC",
		pins: ["ground", "trigger", "output", "reset", "control", "threshold", "discharge", "vcc"],
		params: {},
		defaults: {},
	}),
	// Logic display, CircuitJS1 SevenSegElm's default mode: a segment lights while its pin is at logic 1.
	defineComponent("seven-segment", {
		idPrefix: "DISP",
		pins: ["a", "b", "c", "d", "e", "f", "g", "dp"],
		params: {},
		defaults: {},
	}),
	// CircuitJS1 SevenSegDecoderElm table, including A–F for 10–15.
	defineComponent("bcd-to-seven-segment", {
		idPrefix: "DEC",
		pins: ["d0", "d1", "d2", "d3", "a", "b", "c", "d", "e", "f", "g"],
		params: {},
		defaults: {},
	}),
	// Fixed at 4 bits: a part type's pins never change (ADR-009). CircuitJS1 ADCElm / DACElm behaviour.
	defineComponent("adc-4bit", {
		idPrefix: "ADC",
		pins: ["in", "vref", "d0", "d1", "d2", "d3"],
		params: {},
		defaults: {},
	}),
	defineComponent("dac-4bit", {
		idPrefix: "DAC",
		pins: ["d0", "d1", "d2", "d3", "vref", "out"],
		params: {},
		defaults: {},
	}),
	// The same converters with 8 data pins (0–255): a separate type, since pins never change with a setting (ADR-009).
	// Prefix B for byte.
	defineComponent("adc-8bit", {
		idPrefix: "ADCB",
		pins: ["in", "vref", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"],
		params: {},
		defaults: {},
	}),
	defineComponent("dac-8bit", {
		idPrefix: "DACB",
		pins: ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "vref", "out"],
		params: {},
		defaults: {},
	}),
] as const
