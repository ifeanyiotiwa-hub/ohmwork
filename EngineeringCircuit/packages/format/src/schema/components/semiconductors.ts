import { z } from "zod"
import { defineComponent, positive } from "./define"

// Diode-family parameters follow SPICE (ngspice manual §7.2); defaults are CircuitJS1's models (DiodeModel.ts).
const diodeParams = {
	saturationCurrent: positive("amps (IS)"),
	emissionCoefficient: positive("ratio (N), 1 for an ideal junction"),
	seriesResistance: z.number().nonnegative().describe("ohms (RS)"),
}
/** CircuitJS1 "default" diode: about 0.53 V at 4.5 mA. */
const DIODE_DEFAULTS = { saturationCurrent: 1.7143528192808883e-7, emissionCoefficient: 2, seriesResistance: 0 }
/** CircuitJS1 "default-led" (a red LED model): about 1.8 V at 15 mA. */
const LED_DEFAULTS = { saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 }
const ledParams = { ...diodeParams, maxBrightnessCurrent: positive("amps for full brightness") }

const transistorParams = {
	beta: positive("ratio, forward current gain (SPICE BF)"),
	betaReverse: positive("ratio, reverse current gain (SPICE BR)"),
	saturationCurrent: positive("amps (IS)"),
}
/** CircuitJS1 TransistorModel "default". */
const TRANSISTOR_DEFAULTS = { beta: 100, betaReverse: 1, saturationCurrent: 1e-13 }

const mosfetParams = {
	thresholdVoltage: positive("volts between gate and source where it starts to conduct (a size; a P-MOSFET's gate goes below its source)"),
	transconductance: positive("amps per volt squared (SPICE KP with W = L)"),
}
/** CircuitJS1 MosfetElm defaults. */
const MOSFET_DEFAULTS = { thresholdVoltage: 1.5, transconductance: 0.02 }

export const SEMICONDUCTORS = [
	defineComponent("diode", { idPrefix: "D", pins: ["anode", "cathode"], params: diodeParams, defaults: DIODE_DEFAULTS }),
	defineComponent("zener-diode", {
		idPrefix: "DZ",
		pins: ["anode", "cathode"],
		params: { ...diodeParams, breakdownVoltage: positive("volts, reverse voltage where it conducts 5 mA") },
		defaults: { ...DIODE_DEFAULTS, breakdownVoltage: 5.6 },
	}),
	defineComponent("led", {
		idPrefix: "LED",
		pins: ["anode", "cathode"],
		params: { color: z.enum(["red", "green", "blue", "yellow", "white"]), ...ledParams },
		defaults: { color: "red", ...LED_DEFAULTS },
	}),
	defineComponent("rgb-led", {
		idPrefix: "RGB",
		pins: ["red", "green", "blue", "common"],
		params: { commonCathode: z.boolean().describe("true = the shared pin is the cathode (minus side)"), ...ledParams },
		defaults: { commonCathode: true, ...LED_DEFAULTS },
	}),
	defineComponent("npn-transistor", {
		idPrefix: "Q",
		pins: ["collector", "base", "emitter"],
		params: transistorParams,
		defaults: TRANSISTOR_DEFAULTS,
	}),
	defineComponent("pnp-transistor", {
		idPrefix: "QP",
		pins: ["collector", "base", "emitter"],
		params: transistorParams,
		defaults: TRANSISTOR_DEFAULTS,
	}),
	defineComponent("n-mosfet", { idPrefix: "M", pins: ["drain", "gate", "source"], params: mosfetParams, defaults: MOSFET_DEFAULTS }),
	defineComponent("p-mosfet", { idPrefix: "MP", pins: ["drain", "gate", "source"], params: mosfetParams, defaults: MOSFET_DEFAULTS }),
] as const
