// P-N junction helpers. Voltage limiting follows SPICE's pnjlim as written in CircuitJS1 (Paul Falstad, GPL-2.0)
// Diode.limitStep and TransistorElm.limitStep.

/** kT/q at 27 °C, SPICE's default temperature (CircuitJS1 uses the same value). */
export const THERMAL_VOLTAGE = 0.025865

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
