export type JsonObject = Record<string, unknown>
export type Migration = (document: JsonObject) => JsonObject

/**
 * Version 3 gave diodes and LEDs electrical parameters. The values are frozen here (CircuitJS1's defaults at the
 * time), so changing a catalog default later never changes what an old file means.
 */
const V3_ADDED_PARAMS: Readonly<Record<string, JsonObject>> = {
	diode: { saturationCurrent: 1.7143528192808883e-7, emissionCoefficient: 2, seriesResistance: 0 },
	led: { saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 },
}

export const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value)

/** Keyed by the version migrated from. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
	1: (document) => ({ ...document, simulation: { timeStep: 5e-6, speed: 0.01 } }),
	2: (document) => ({
		...document,
		components: Array.isArray(document.components)
			? document.components.map((component: unknown) => {
					if (!isObject(component) || typeof component.type !== "string") return component
					const added = V3_ADDED_PARAMS[component.type]
					const params = isObject(component.params) ? component.params : {}
					return added ? { ...component, params: { ...added, ...params } } : component
				})
			: document.components,
	}),
	3: (document) => ({
		...document,
		simulation: { ...(isObject(document.simulation) ? document.simulation : {}), logicHigh: 5 },
	}),
	4: (document) => ({ ...document, notes: [] }),
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
