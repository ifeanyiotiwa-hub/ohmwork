export type JsonObject = Record<string, unknown>
export type Migration = (document: JsonObject) => JsonObject

/**
 * Version 3 gave diodes and LEDs electrical parameters. The values are frozen here (CircuitJS1's defaults at the
 * time), so changing a catalog default later never changes what an old file means.
 */
/** Version 6 gave parts ratings: ¼ W resistors, 1 A diodes, 30 mA LEDs (all LEDs then used the red model). */
const V6_ADDED_PARAMS: Readonly<Record<string, JsonObject>> = {
	resistor: { powerRating: 0.25 },
	diode: { maxCurrent: 1 },
	led: { maxCurrent: 0.03 },
}

const V3_ADDED_PARAMS: Readonly<Record<string, JsonObject>> = {
	diode: { saturationCurrent: 1.7143528192808883e-7, emissionCoefficient: 2, seriesResistance: 0 },
	led: { saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 },
}

export const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value)

/** Fills parameters a part type gained, keeping any the document already has. */
function addParams(document: JsonObject, added: Readonly<Record<string, JsonObject>>): JsonObject {
	if (!Array.isArray(document.components)) return document
	return {
		...document,
		components: document.components.map((component: unknown) => {
			if (!isObject(component) || typeof component.type !== "string") return component
			const extra = added[component.type]
			const params = isObject(component.params) ? component.params : {}
			return extra ? { ...component, params: { ...extra, ...params } } : component
		}),
	}
}

/**
 * Version 7 gave each colour of an RGB LED its own model and rating. An old RGB LED keeps its one model on all three
 * colours, so it behaves as before; the ratings are the Kingbright WP154A4SUREQBFZGW values (frozen here).
 */
const V7_RGB_RATINGS: JsonObject = { redMaxCurrent: 0.03, greenMaxCurrent: 0.025, blueMaxCurrent: 0.03 }

function splitRgbModels(document: JsonObject): JsonObject {
	if (!Array.isArray(document.components)) return document
	return {
		...document,
		components: document.components.map((component: unknown) => {
			if (!isObject(component) || component.type !== "rgb-led" || !isObject(component.params)) return component
			const { saturationCurrent, ...rest } = component.params
			const perColour = { redSaturationCurrent: saturationCurrent, greenSaturationCurrent: saturationCurrent, blueSaturationCurrent: saturationCurrent }
			return { ...component, params: { ...rest, ...perColour, ...V7_RGB_RATINGS } }
		}),
	}
}

/** Version 8 rated Zeners, transistors and MOSFETs (datasheet values in semiconductors.ts, frozen here). */
const V8_ADDED_PARAMS: Readonly<Record<string, JsonObject>> = {
	"zener-diode": { maxCurrent: 0.162 },
	"npn-transistor": { maxCurrent: 0.2, maxPower: 0.625 },
	"pnp-transistor": { maxCurrent: 0.2, maxPower: 0.625 },
	"n-mosfet": { maxCurrent: 0.17, maxPower: 0.37 },
	"p-mosfet": { maxCurrent: 0.13, maxPower: 0.3 },
}

/**
 * Version 9 gave the op-amp a gain-bandwidth, a slew rate and an output current limit. Old op-amps get values so large
 * that they behave exactly as before (ideal); new ones get the LM741's.
 */
const V9_ADDED_PARAMS: Readonly<Record<string, JsonObject>> = {
	"op-amp": { gainBandwidth: 1e15, slewRate: 1e15, maxOutputCurrent: 1e6 },
	// …and transistors gained an Early effect and stored charge; old ones keep none of either.
	"npn-transistor": { earlyVoltage: 1e15, emitterCapacitance: 0, collectorCapacitance: 0, transitTime: 0, reverseTransitTime: 0 },
	"pnp-transistor": { earlyVoltage: 1e15, emitterCapacitance: 0, collectorCapacitance: 0, transitTime: 0, reverseTransitTime: 0 },
	"n-mosfet": { gateSourceCapacitance: 0, gateDrainCapacitance: 0 },
	"p-mosfet": { gateSourceCapacitance: 0, gateDrainCapacitance: 0 },
}

/** Keyed by the version migrated from. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
	1: (document) => ({ ...document, simulation: { timeStep: 5e-6, speed: 0.01 } }),
	2: (document) => addParams(document, V3_ADDED_PARAMS),
	3: (document) => ({
		...document,
		simulation: { ...(isObject(document.simulation) ? document.simulation : {}), logicHigh: 5 },
	}),
	4: (document) => ({ ...document, notes: [] }),
	5: (document) => addParams(document, V6_ADDED_PARAMS),
	6: splitRgbModels,
	7: (document) => addParams(document, V8_ADDED_PARAMS),
	// Also a circuit temperature, SPICE's nominal 27 °C, where every part behaves as it did.
	8: (document) => ({
		...addParams(document, V9_ADDED_PARAMS),
		simulation: { ...(isObject(document.simulation) ? document.simulation : {}), temperature: 27 },
	}),
}

export type MigrationResult = { ok: true; document: JsonObject } | { ok: false; message: string }

export function migrate(
	document: JsonObject,
	fromVersion: number,
	toVersion: number,
	migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): MigrationResult {
	let current = document
	for (let version = fromVersion; version < toVersion; version++) {
		const step = migrations[version]
		if (!step) {
			return { ok: false, message: `No migration from version ${version} to ${version + 1}` }
		}
		current = { ...step(current), version: version + 1 }
	}
	return { ok: true, document: current }
}
