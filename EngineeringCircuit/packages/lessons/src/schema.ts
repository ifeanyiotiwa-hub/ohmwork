import { COMPONENT_DEFINITIONS, type ComponentType, pinsOf } from "@ohmwork/format"
import * as z from "zod"

// An enum, not a custom check, so it has a JSON Schema: the agent drafting a lesson sees every valid type.
const partType = z.enum(COMPONENT_DEFINITIONS.map((definition) => definition.type) as [ComponentType, ...ComponentType[]])
const range = z.tuple([z.number(), z.number()]).describe("lowest and highest accepted value")
const quantity = z.enum(["voltage", "current", "power"])
/** Every check says, in plain words, what it is looking for: the learner and the tutor read it. */
const description = z.string().min(1)

/**
 * What a lesson checks. Checks look at what the circuit does, never at part ids or positions, so any correct
 * circuit passes however it is laid out or named.
 */
export const checkSchema = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("has-part"), type: partType, atLeast: z.number().int().positive(), description }),
	/** Some part of the type has a DC reading in range (by size unless `signed`); `pressed` holds every push button. */
	z.strictObject({
		kind: z.literal("reading"),
		type: partType,
		quantity,
		between: range,
		signed: z.boolean().optional(),
		pressed: z.boolean().optional(),
		description,
	}),
	/** Some point (node) in the circuit sits at a DC voltage in range. */
	z.strictObject({ kind: z.literal("node-voltage"), between: range, description }),
	/** Running from rest for `at` seconds, some part of the type has a reading in range (by size). */
	z.strictObject({ kind: z.literal("reading-at"), type: partType, quantity, at: z.number().positive(), between: range, description }),
	/**
	 * Logic inputs (in id order) set to each row's inputs give logic outputs matching each row's outputs. Output
	 * columns may come in any order: what matters is that some output behaves like each expected column.
	 */
	z.strictObject({
		kind: z.literal("truth-table"),
		rows: z.array(z.strictObject({ inputs: z.array(z.boolean()), outputs: z.array(z.boolean()) })).min(1),
		description,
	}),
	z.strictObject({ kind: z.literal("no-errors"), description }),
	/** Some part of the type has the named pin at a DC voltage in range (from ground): an op-amp's output, a 555's. */
	z.strictObject({ kind: z.literal("pin-voltage"), type: partType, pin: z.string().min(1), between: range, description }),
	/**
	 * Running from rest, after `after` seconds and for `for` more, some part of the type has the named pin going up and
	 * down `between` times a second (rising through the middle of its swing).
	 */
	z.strictObject({
		kind: z.literal("frequency"),
		type: partType,
		pin: z.string().min(1),
		after: z.number().nonnegative().describe("seconds to settle first"),
		for: z.number().positive().describe("seconds to measure over"),
		between: range.describe("lowest and highest accepted hertz"),
		description,
	}),
	/** At `at` hertz, some scope probe sees a gain in range (decibels), relative to the circuit's first AC source. */
	z.strictObject({ kind: z.literal("ac-gain"), at: z.number().positive(), between: range.describe("lowest and highest accepted dB"), description }),
])
export type Check = z.infer<typeof checkSchema>

export const lessonSchema = z.strictObject({
	id: z.string().regex(/^[a-z0-9-]+$/),
	title: z.string().min(1),
	level: z.enum(["beginner", "intermediate", "advanced"]),
	/** A lesson guides with steps and hints; a challenge gives the goal and leaves the how to the learner. */
	kind: z.enum(["lesson", "challenge"]),
	summary: z.string(),
	/** What the learner should end up with, in one or two sentences. */
	goal: z.string(),
	/** Suggested steps; `hint` is held back for when the learner is stuck. */
	steps: z.array(z.strictObject({ text: z.string().min(1), hint: z.string().optional() })),
	checks: z.array(checkSchema).min(1),
}).superRefine((lesson, context) => {
	lesson.checks.forEach((check, index) => {
		if ((check.kind === "pin-voltage" || check.kind === "frequency") && !pinsOf(check.type).includes(check.pin)) {
			context.addIssue({ code: "custom", path: ["checks", index, "pin"], message: `${check.type} has no pin "${check.pin}" (valid: ${pinsOf(check.type).join(", ")})` })
		}
	})
})
export type Lesson = z.infer<typeof lessonSchema>
