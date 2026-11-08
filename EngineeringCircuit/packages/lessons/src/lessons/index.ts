import type { Lesson } from "../schema"
import { HALF_ADDER } from "./half-adder"
import { LIGHT_AN_LED } from "./light-an-led"
import { RC_CHARGING } from "./rc-charging"
import { TRANSISTOR_SWITCH } from "./transistor-switch"
import { VOLTAGE_DIVIDER } from "./voltage-divider"

/** The starter lessons, in teaching order. Adding a lesson: one file here, plus a reference solution in the tests. */
export const LESSONS: readonly Lesson[] = [LIGHT_AN_LED, VOLTAGE_DIVIDER, RC_CHARGING, TRANSISTOR_SWITCH, HALF_ADDER]

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((lesson) => lesson.id === id)
