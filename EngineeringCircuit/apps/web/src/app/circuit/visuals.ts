import type { UiConfig } from "./ui-config"

export type Flow = { seconds: number; reverse: boolean }

export function flowOf(current: number, config: UiConfig["flow"]): Flow | undefined {
	const magnitude = Math.abs(current)
	if (magnitude < config.minCurrent) return undefined
	const decades = Math.log10(magnitude / config.minCurrent)
	const pixelsPerSecond = Math.min(config.maxPixelsPerSecond, decades * config.pixelsPerSecondPerDecade)
	return { seconds: config.dashPeriod / pixelsPerSecond, reverse: current < 0 }
}

export type Spin = { seconds: number; reverse: boolean }

/**
 * How a motor's rotor turns on screen: at its simulated speed (rad/s) played at the simulation's speed, so it matches
 * the clock, but no faster than one turn per `minSecondsPerTurn` (faster would strobe) and not at all when a turn
 * would take longer than `maxSecondsPerTurn`.
 */
export function spinOf(speed: number, simulationSpeed: number, config: UiConfig["spin"]): Spin | undefined {
	const radiansPerSecond = Math.abs(speed) * simulationSpeed
	if (radiansPerSecond === 0) return undefined
	const seconds = (2 * Math.PI) / radiansPerSecond
	if (seconds > config.maxSecondsPerTurn) return undefined
	return { seconds: Math.max(config.minSecondsPerTurn, seconds), reverse: speed < 0 }
}

const NEUTRAL = { hue: 220, saturation: 8, lightness: 55 }
const POSITIVE_HUE = 145
const NEGATIVE_HUE = 0

export function voltageColour(voltage: number, largestMagnitude: number): string {
	if (largestMagnitude === 0 || voltage === 0) {
		return `hsl(${NEUTRAL.hue} ${NEUTRAL.saturation}% ${NEUTRAL.lightness}%)`
	}
	const strength = Math.min(1, Math.abs(voltage) / largestMagnitude)
	const hue = voltage > 0 ? POSITIVE_HUE : NEGATIVE_HUE
	return `hsl(${hue} ${Math.round(30 + 50 * strength)}% ${Math.round(55 - 10 * strength)}%)`
}
