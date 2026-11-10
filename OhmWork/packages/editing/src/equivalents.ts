import { type ComponentType, definitionOf } from "@ohmwork/format"

/**
 * Other forms accepted for a stored quantity (COMPONENTS.md: one stored value per quantity, so they can't disagree).
 * A period is stored as its frequency; an RMS voltage as its peak (sine).
 */
const EQUIVALENTS: Readonly<Record<string, { stored: string; convert: (value: number) => number }>> = {
	period: { stored: "frequency", convert: (period) => 1 / period },
	rms: { stored: "amplitude", convert: (rms) => rms * Math.SQRT2 },
}

export function storedParam(type: ComponentType, name: string, value: unknown): { name: string; value: unknown } {
	const equivalent = EQUIVALENTS[name]
	const params = Object.keys(definitionOf(type).schema.shape.params.shape)
	if (!equivalent || typeof value !== "number" || params.includes(name) || !params.includes(equivalent.stored)) {
		return { name, value }
	}
	return { name: equivalent.stored, value: equivalent.convert(value) }
}

export function storedParams(type: ComponentType, params: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(params).map(([name, value]) => {
			const stored = storedParam(type, name, value)
			return [stored.name, stored.value]
		}),
	)
}
