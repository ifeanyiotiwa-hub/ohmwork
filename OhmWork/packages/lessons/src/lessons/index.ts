import type { Lesson } from "../schema"
import { BLINK_ONCE_A_SECOND } from "./blink-once-a-second"
import { CLOCK_DIVIDER } from "./clock-divider"
import { HALF_ADDER } from "./half-adder"
import { LIGHT_AN_LED } from "./light-an-led"
import { LOW_PASS_FILTER } from "./low-pass-filter"
import { OP_AMP_AMPLIFIER } from "./op-amp-amplifier"
import { RC_CHARGING } from "./rc-charging"
import { TIMER_555_BLINKER } from "./timer-555-blinker"
import { TRANSISTOR_SWITCH } from "./transistor-switch"
import { VOLTAGE_DIVIDER } from "./voltage-divider"

/**
 * The lessons and challenges, in teaching order. Adding one: a file here, plus a reference solution and a typical
 * mistake in the tests (LESSONS.md in the project docs).
 */
export const LESSONS: readonly Lesson[] = [
	LIGHT_AN_LED,
	VOLTAGE_DIVIDER,
	RC_CHARGING,
	TRANSISTOR_SWITCH,
	HALF_ADDER,
	OP_AMP_AMPLIFIER,
	CLOCK_DIVIDER,
	TIMER_555_BLINKER,
	BLINK_ONCE_A_SECOND,
	LOW_PASS_FILTER,
]

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((lesson) => lesson.id === id)
