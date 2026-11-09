// P-N junction helpers. Voltage limiting follows SPICE's pnjlim as written in CircuitJS1 (Paul Falstad, GPL-2.0)
// Diode.limitStep and TransistorElm.limitStep.

/** kT/q at 27 °C, SPICE's default temperature (CircuitJS1 uses the same value). */
export const THERMAL_VOLTAGE = 0.025865
/** SPICE's nominal temperature, where model parameters are given. */
export const NOMINAL_TEMPERATURE = 27
const KELVIN = 273.15
/** ngspice's defaults for silicon: band gap EG (eV) and the saturation current's temperature exponent XTI. */
const SILICON_BAND_GAP = 1.11
const SATURATION_EXPONENT = 3

/** kT/q at a temperature in °C (proportional to absolute temperature; THERMAL_VOLTAGE at 27 °C). */
export const thermalVoltageAt = (celsius: number) => (THERMAL_VOLTAGE * (celsius + KELVIN)) / (NOMINAL_TEMPERATURE + KELVIN)

/**
 * A silicon junction's saturation current at a temperature, from its value at 27 °C (SPICE / ngspice):
 * IS(T) = IS · (T/Tnom)^(XTI/N) · exp((T/Tnom − 1) · EG / (N · Vt(T))).
 */
export function saturationCurrentAt(saturationCurrent: number, celsius: number, emissionCoefficient = 1): number {
	if (celsius === NOMINAL_TEMPERATURE) return saturationCurrent
	const ratio = (celsius + KELVIN) / (NOMINAL_TEMPERATURE + KELVIN)
	const exponent = ((ratio - 1) * SILICON_BAND_GAP) / (emissionCoefficient * thermalVoltageAt(celsius))
	return saturationCurrent * ratio ** (SATURATION_EXPONENT / emissionCoefficient) * Math.exp(exponent)
}

/** Voltage above which the exponential is steep enough that Newton steps must be limited. */
export const criticalVoltage = (scale: number, saturationCurrent: number) =>
	scale * Math.log(scale / (Math.SQRT2 * saturationCurrent))

/**
 * Limits a new junction voltage so the current changes by at most about e² per iteration: if the jump is large,
 * move to the voltage where the exponential gives the current the previous linearization predicted.
 */
export function limitJunction(next: number, previous: number, scale: number, critical: number): number {
	if (next <= critical || Math.abs(next - previous) <= 2 * scale) return next
	if (previous > 0) {
		const ratio = 1 + (next - previous) / scale
		return ratio > 0 ? previous + scale * Math.log(ratio) : critical
	}
	return scale * Math.log(next / scale)
}
