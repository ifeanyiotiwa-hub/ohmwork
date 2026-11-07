const SMALLEST_PREFIX = { symbol: "p", factor: 1e-12 }
const PREFIXES = [
	{ symbol: "G", factor: 1e9 },
	{ symbol: "M", factor: 1e6 },
	{ symbol: "k", factor: 1e3 },
	{ symbol: "", factor: 1 },
	{ symbol: "m", factor: 1e-3 },
	{ symbol: "µ", factor: 1e-6 },
	{ symbol: "n", factor: 1e-9 },
	SMALLEST_PREFIX,
]

const FACTOR_BY_PREFIX: Record<string, number> = { ...Object.fromEntries(PREFIXES.map((p) => [p.symbol, p.factor])), u: 1e-6 }

const UNIT_SYMBOLS: Record<string, string> = {
	ohms: "Ω",
	volts: "V",
	amps: "A",
	farads: "F",
	henries: "H",
	hertz: "Hz",
	seconds: "s",
	degrees: "°",
}

const SIGNIFICANT_DIGITS = 3
const ROUNDING_HEADROOM = 0.9995

export function formatSi(value: number, unit: string): string {
	if (value === 0 || !Number.isFinite(value)) return `0 ${unit}`
	const magnitude = Math.abs(value)
	const prefix = PREFIXES.find((candidate) => magnitude >= candidate.factor * ROUNDING_HEADROOM) ?? SMALLEST_PREFIX
	return `${Number((value / prefix.factor).toPrecision(SIGNIFICANT_DIGITS))} ${prefix.symbol}${unit}`
}

export function parseSi(text: string): number | undefined {
	const match = /^\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([GMkmuµnp]?)[A-Za-zΩ]*\s*$/.exec(text)
	if (!match) return undefined
	const [, number = "", prefix = ""] = match
	return Number(number) * (FACTOR_BY_PREFIX[prefix] ?? 1)
}

export function unitSymbolOf(description: string): string {
	const [firstWord = ""] = description.split(/[\s,]/)
	return UNIT_SYMBOLS[firstWord] ?? ""
}
