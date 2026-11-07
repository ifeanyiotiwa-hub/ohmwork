import type { DcSolution } from "@engineering-circuit/engine"
import type { Component } from "@engineering-circuit/format"

/** How a lit part shows: a colour and how strongly (0 to 1). */
export type Glow = { colour: string; strength: number }

const LED_COLOURS: Record<string, readonly [number, number, number]> = {
	red: [255, 77, 77],
	green: [77, 255, 136],
	blue: [77, 157, 255],
	yellow: [255, 216, 77],
	white: [255, 255, 255],
}
const LAMP_COLOUR = "var(--flow)"
const LOGIC_ON = "var(--voltage-label)"

const clampUnit = (value: number) => Math.max(0, Math.min(1, value))
const rgb = ([red, green, blue]: readonly [number, number, number]) =>
	`rgb(${Math.round(red)} ${Math.round(green)} ${Math.round(blue)})`

/**
 * Lamps glow with their share of rated power; LEDs with their forward current over the full-brightness current
 * (as CircuitJS1 does). An RGB LED mixes its three colours by each one's current. Undefined for parts that never light.
 */
export function glowOf(part: Component, solution: DcSolution | undefined, logicHigh: number): Glow | undefined {
	switch (part.type) {
		case "lamp": {
			const reading = solution?.readings[part.id]
			const power = reading ? Math.abs(reading.voltage * reading.current) : 0
			return { colour: LAMP_COLOUR, strength: clampUnit(power / part.params.ratedPower) }
		}
		case "led": {
			const current = solution?.readings[part.id]?.current ?? 0
			return { colour: rgb(LED_COLOURS[part.params.color] ?? [255, 255, 255]), strength: clampUnit(current / part.params.maxBrightnessCurrent) }
		}
		case "rgb-led": {
			const shares = (["red", "green", "blue"] as const).map((colour) =>
				clampUnit((solution?.ports[`${part.id}/${colour}`]?.current ?? 0) / part.params.maxBrightnessCurrent),
			)
			const strength = Math.max(...shares)
			const [red = 0, green = 0, blue = 0] = shares.map((share) => (strength === 0 ? 0 : (255 * share) / strength))
			return { colour: rgb([red, green, blue]), strength }
		}
		// Logic inputs and indicators light at 1 (above half the logic level).
		case "logic-input":
			return { colour: LOGIC_ON, strength: part.params.high ? 1 : 0 }
		case "logic-output": {
			const voltage = solution?.pinVoltages[`${part.id}:in`] ?? 0
			return { colour: LOGIC_ON, strength: voltage > logicHigh / 2 ? 1 : 0 }
		}
		default:
			return undefined
	}
}
