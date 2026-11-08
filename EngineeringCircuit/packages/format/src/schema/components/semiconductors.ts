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
const maxCurrent = positive("amps it can carry continuously; more is reported as burning it out")
/** 1N4001–1N4007 family: 1.0 A average forward current. */
const DIODE_MAX_CURRENT = 1

export const LED_COLORS = ["red", "green", "blue", "yellow", "white"] as const
export type LedColor = (typeof LED_COLORS)[number]
export type LedModel = { saturationCurrent: number; emissionCoefficient: number; seriesResistance: number; maxCurrent: number }

/**
 * One model per colour. Red is CircuitJS1's "default-led" (1.85 V at 20 mA, inside Kingbright's 1.85–2.1 V red
 * range). The others keep its shape (N 3.73, RS 0.042 Ω) with IS chosen for the Kingbright 5 mm typical forward
 * voltage at 20 mA: yellow 2.1 V, green 2.2 V, blue 3.3 V (L-7113QBC-D), white 3.3 V (a blue InGaN chip under a
 * phosphor; a discontinued L-7113MWC listing gives 3.8 V). Max DC current: 30 mA, green 25 mA.
 */
export const LED_MODELS: Readonly<Record<LedColor, LedModel>> = {
	red: { saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxCurrent: 0.03 },
	yellow: { saturationCurrent: 7.105e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxCurrent: 0.03 },
	green: { saturationCurrent: 2.52e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxCurrent: 0.025 },
	blue: { saturationCurrent: 2.816e-17, emissionCoefficient: 3.73, seriesResistance: 0.042, maxCurrent: 0.03 },
	white: { saturationCurrent: 2.816e-17, emissionCoefficient: 3.73, seriesResistance: 0.042, maxCurrent: 0.03 },
}
const LED_DEFAULTS = { ...LED_MODELS.red, maxBrightnessCurrent: 0.01 }

export const RGB_COLOURS = ["red", "green", "blue"] as const
/**
 * An RGB LED is three LEDs sharing a pin. Kingbright WP154A4SUREQBFZGW (5 mm full colour, spec DSAJ8688 V.12A,
 * 2024-11-01): forward voltage at 20 mA red 1.9 V, blue 3.3 V, green 3.3 V (an InGaN chip, like the blue), ±0.1 V;
 * DC forward current red 30, green 25, blue 30 mA. Red uses the red LED model; green and blue the InGaN blue one.
 * N and RS are shared, as they are across all the LED models.
 */
const RGB_DEFAULTS = {
	commonCathode: true,
	emissionCoefficient: LED_MODELS.red.emissionCoefficient,
	seriesResistance: LED_MODELS.red.seriesResistance,
	redSaturationCurrent: LED_MODELS.red.saturationCurrent,
	greenSaturationCurrent: LED_MODELS.blue.saturationCurrent,
	blueSaturationCurrent: LED_MODELS.blue.saturationCurrent,
	redMaxCurrent: 0.03,
	greenMaxCurrent: 0.025,
	blueMaxCurrent: 0.03,
	maxBrightnessCurrent: 0.01,
}
const ledParams = { ...diodeParams, maxCurrent, maxBrightnessCurrent: positive("amps for full brightness") }

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
	defineComponent("diode", {
		idPrefix: "D",
		pins: ["anode", "cathode"],
		params: { ...diodeParams, maxCurrent },
		defaults: { ...DIODE_DEFAULTS, maxCurrent: DIODE_MAX_CURRENT },
	}),
	defineComponent("zener-diode", {
		idPrefix: "DZ",
		pins: ["anode", "cathode"],
		params: { ...diodeParams, breakdownVoltage: positive("volts, reverse voltage where it conducts 5 mA") },
		defaults: { ...DIODE_DEFAULTS, breakdownVoltage: 5.6 },
	}),
	defineComponent("led", {
		idPrefix: "LED",
		pins: ["anode", "cathode"],
		params: { color: z.enum(LED_COLORS), ...ledParams },
		defaults: { color: "red", ...LED_DEFAULTS },
	}),
	defineComponent("rgb-led", {
		idPrefix: "RGB",
		pins: ["red", "green", "blue", "common"],
		params: {
			commonCathode: z.boolean().describe("true = the shared pin is the cathode (minus side)"),
			emissionCoefficient: diodeParams.emissionCoefficient,
			seriesResistance: diodeParams.seriesResistance,
			redSaturationCurrent: positive("amps (IS) of the red LED"),
			greenSaturationCurrent: positive("amps (IS) of the green LED"),
			blueSaturationCurrent: positive("amps (IS) of the blue LED"),
			redMaxCurrent: positive("amps the red LED can carry continuously"),
			greenMaxCurrent: positive("amps the green LED can carry continuously"),
			blueMaxCurrent: positive("amps the blue LED can carry continuously"),
			maxBrightnessCurrent: positive("amps for full brightness"),
		},
		defaults: RGB_DEFAULTS,
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
