// Source waveforms as SPICE defines them (ngspice manual §4.1): SIN without damping, PULSE with instant edges.

export type SineParams = { amplitude: number; frequency: number; offset: number; phase: number; delay: number }
export type SquareParams = { low: number; high: number; frequency: number; dutyCycle: number }

const DEGREES_TO_RADIANS = Math.PI / 180

/** Before `delay` the source holds its starting value (SPICE SIN). */
export function acVoltage({ amplitude, frequency, offset, phase, delay }: SineParams, time: number): number {
	const elapsed = Math.max(0, time - delay)
	return offset + amplitude * Math.sin(2 * Math.PI * frequency * elapsed + phase * DEGREES_TO_RADIANS)
}

/** High for the first `dutyCycle` of every period, starting at time 0. */
export function squareVoltage({ low, high, frequency, dutyCycle }: SquareParams, time: number): number {
	const cycles = time * frequency
	return cycles - Math.floor(cycles) < dutyCycle ? high : low
}
