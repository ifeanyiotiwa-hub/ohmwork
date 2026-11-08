import { readFile, stat, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { CircuitDocument, type DocumentChange, type EditCommand } from "@engineering-circuit/editing"
import { type TransientState, initialTransientState, solveDc, stepTransient } from "@engineering-circuit/engine"
import {
	COMPONENT_DEFINITIONS,
	type ComponentType,
	type PinRef,
	createCircuit,
	parseCircuitJson,
	rotationSchema,
	serializeCircuit,
} from "@engineering-circuit/format"
import { LESSONS, type Lesson, checkSolution, lessonById } from "@engineering-circuit/lessons"
import { type CallToolResult, McpServer, completable } from "@modelcontextprotocol/server"
import { z } from "zod"
import type { LiveServer } from "./live/live-server"
import { DEFAULT_OPTIONS, type ServerOptions } from "./options"
import {
	componentTypesReport,
	explanation,
	findProbeTarget,
	pinPositionsReport,
	probeReport,
	probeValues,
	simulationReport,
} from "./reports"

const INSTRUCTIONS = `EngineeringCircuit: build, simulate and explain electronic circuits with a learner.
Workflow: list_component_types → create_circuit → add_component → connect → simulate / probe → explain_circuit.
Pins are written "<componentId>.<pin>", e.g. "R1.a". Every circuit needs a ground part for 0 V.
Explain from the tool results (real simulated values and warnings), in plain language suited to a beginner.
Edits are recorded with their author and can be undone.
Layout (the learner sees it, so make it read like a textbook diagram): x grows right, y grows down, grid 20.
pinOffsets (list_component_types) are at rotation 0; rotation turns parts clockwise in 90° steps, so 90 makes a two-pin part vertical with its first pin on top.
A wire leaves each pin in the direction the pin points (away from its part) and turns at right angles; pins facing each other on the same x or y join with a straight wire.
get_circuit lists every pin's position; use move_component / rotate_component to tidy up.
Meters are ideal: a voltmeter goes across a part, an ammeter in series (across a battery it is a short circuit), an ohmmeter across an unpowered part.
Push buttons are released unless you list them in simulate/probe "pressed"; in the app the learner holds them with the mouse.
Lessons: list_lessons, load_lesson, then let the learner build; check_solution tells you what passes and what the circuit actually does. Use the "tutor" prompt for the coaching style.
Logic parts need no supply pins: outputs are 0 V or logic high (default 5 V) from ground, inputs read 1 above half of it, and each gate or flip-flop takes one time step to respond. Clocks, flip-flops and counters need simulate_over_time; simulate settles static logic and reports oscillators.
open_in_app gives the learner a link to watch and edit this same circuit in the app; while they do, call recent_changes before explaining so you know what they changed.`

const COMPONENT_TYPES = COMPONENT_DEFINITIONS.map((definition) => definition.type) as [ComponentType, ...ComponentType[]]
const READ_ONLY = { readOnlyHint: true }

const text = (value: unknown): CallToolResult => ({
	content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
})
type Problem = { message: string; path?: string }

const failure = (problems: string | readonly Problem[]): CallToolResult => {
	const lines =
		typeof problems === "string"
			? problems
			: problems.map((problem) => (problem.path ? `${problem.path}: ${problem.message}` : problem.message)).join("\n")
	return { ...text(lines), isError: true }
}

function pinRef(label: string): PinRef | undefined {
	const separator = label.lastIndexOf(".")
	if (separator <= 0 || separator === label.length - 1) return undefined
	return { componentId: label.slice(0, separator), pin: label.slice(separator + 1) }
}

const pinLabelSchema = z.string().describe('A pin as "<componentId>.<pin>", e.g. "R1.a"')
const pressedSchema = z
	.array(z.string().min(1))
	.optional()
	.describe("Push buttons to hold down for this reading, e.g. [\"PB1\"]; all others are released")
const DEFAULT_SAMPLES = 20
const MAX_SAMPLES = 200
const inputsOf = (pressed: readonly string[] | undefined) => ({ pressed: new Set(pressed) })

export type ServerContext = {
	/** The circuit to edit; shared with the live link when there is one. */
	document?: CircuitDocument
	live?: Pick<LiveServer, "link">
}

export function createServer(
	options: ServerOptions = { ...DEFAULT_OPTIONS, workspaceDirectory: process.cwd() },
	context: ServerContext = {},
): McpServer {
	const server = new McpServer({ name: "engineering-circuit", version: "0.1.0" }, { instructions: INSTRUCTIONS })
	const document =
		context.document ?? new CircuitDocument(createCircuit("Untitled"), { historyLimit: options.historyLimit })

	const changes: DocumentChange[] = []
	let seenRevision = document.revision
	document.subscribe((change) => {
		changes.push(change)
		if (changes.length > options.historyLimit) changes.shift()
	})

	const edit = (command: EditCommand): CallToolResult => {
		const result = document.apply(command, "agent")
		return result.ok ? text(result.summary) : failure(result.errors)
	}

	server.registerTool(
		"list_component_types",
		{
			description: "All part types: pins, parameters (JSON Schema with units) and whether the simulator supports them yet.",
			annotations: READ_ONLY,
		},
		() => text(componentTypesReport()),
	)

	server.registerTool(
		"create_circuit",
		{
			description: "Start a new, empty circuit (replaces the current one; undo brings it back).",
			inputSchema: z.object({ name: z.string().min(1), description: z.string().optional() }),
		},
		({ name, description }) => {
			document.replace({ ...createCircuit(name), description: description ?? "" }, "agent", `Created circuit "${name}"`)
			return text(`Created circuit "${name}"`)
		},
	)

	server.registerTool(
		"add_component",
		{
			description: "Add a part. Ids are numbered automatically per type (R1, R2, V1, GND1) unless you give one.",
			inputSchema: z.object({
				type: z.enum(COMPONENT_TYPES),
				params: z
					.record(z.string(), z.unknown())
					.optional()
					.describe("Parameter values in SI units; omitted ones use the part's defaults (see list_component_types)"),
				id: z.string().min(1).optional(),
				x: z.number().optional(),
				y: z.number().optional(),
				rotation: rotationSchema.optional().describe("Degrees clockwise: 0, 90, 180 or 270 (default 0)"),
			}),
		},
		({ type, params, id, x, y, rotation }) =>
			edit({
				type: "add-component",
				component: { type, params, id, rotation, position: x === undefined || y === undefined ? undefined : { x, y } },
			}),
	)

	server.registerTool(
		"move_component",
		{
			description: "Move a part to a new position (its wires follow and lose any bends).",
			inputSchema: z.object({ componentId: z.string().min(1), x: z.number(), y: z.number() }),
		},
		({ componentId, x, y }) => edit({ type: "move-component", componentId, position: { x, y } }),
	)

	server.registerTool(
		"rotate_component",
		{
			description: "Turn a part to an angle (0, 90, 180, 270 degrees clockwise), or a quarter turn if none is given.",
			inputSchema: z.object({ componentId: z.string().min(1), rotation: rotationSchema.optional() }),
		},
		({ componentId, rotation }) => edit({ type: "rotate-component", componentId, rotation }),
	)

	server.registerTool(
		"remove_component",
		{
			description: "Remove a part and every wire attached to it.",
			inputSchema: z.object({ componentId: z.string().min(1) }),
			annotations: { destructiveHint: true },
		},
		({ componentId }) => edit({ type: "remove-component", componentId }),
	)

	server.registerTool(
		"connect",
		{
			description: "Wire two pins together.",
			inputSchema: z.object({ from: pinLabelSchema, to: pinLabelSchema }),
		},
		({ from, to }) => {
			const fromRef = pinRef(from)
			const toRef = pinRef(to)
			if (!fromRef || !toRef) return failure('Pins are written "<componentId>.<pin>", e.g. "R1.a"')
			return edit({ type: "connect", from: fromRef, to: toRef })
		},
	)

	server.registerTool(
		"disconnect",
		{
			description: "Remove a wire by its id (see get_circuit).",
			inputSchema: z.object({ wireId: z.string().min(1) }),
		},
		({ wireId }) => edit({ type: "disconnect", wireId }),
	)

	server.registerTool(
		"set_parameter",
		{
			description: "Change one parameter of a part, e.g. a resistor's resistance or a switch's closed state.",
			inputSchema: z.object({
				componentId: z.string().min(1),
				name: z.string().min(1),
				value: z.union([z.number(), z.boolean(), z.string()]),
			}),
		},
		({ componentId, name, value }) => edit({ type: "set-parameter", componentId, name, value }),
	)

	server.registerTool("undo", { description: "Undo the most recent change, whoever made it." }, () => {
		const result = document.undo("agent")
		return result.ok ? text(result.summary) : failure(result.message)
	})

	server.registerTool(
		"get_circuit",
		{
			description: "The current circuit as saved JSON, where every pin is on the canvas, and who changed what.",
			annotations: READ_ONLY,
		},
		() =>
			text({ circuit: document.circuit, pinPositions: pinPositionsReport(document.circuit), history: document.history }),
	)

	server.registerTool(
		"simulate",
		{
			description:
				"Solve the circuit (DC): voltage at every node, voltage/current/power of every part (resistance for ohmmeters), and warnings.",
			inputSchema: z.object({ pressed: pressedSchema }),
			annotations: READ_ONLY,
		},
		({ pressed }) => {
			const outcome = solveDc(document.circuit, inputsOf(pressed))
			return outcome.ok ? text(simulationReport(document.circuit, outcome.solution)) : failure(outcome.errors)
		},
	)

	server.registerTool(
		"probe",
		{
			description:
				'Measure one part ("R1": voltage, current, power; an ohmmeter also gives resistance) or one pin ("R1.a": voltage).',
			inputSchema: z.object({ target: z.string().min(1), pressed: pressedSchema }),
			annotations: READ_ONLY,
		},
		({ target, pressed }) => {
			const found = findProbeTarget(document.circuit, target)
			if ("error" in found) return failure(found.error)
			const outcome = solveDc(document.circuit, inputsOf(pressed))
			return outcome.ok ? text(probeReport(outcome.solution, found)) : failure(outcome.errors)
		},
	)

	server.registerTool(
		"simulate_over_time",
		{
			description:
				"Run the circuit over time from rest (capacitors empty, inductors at 0 A) with its time step, and sample probes (parts or pins, as in probe) at evenly spaced times.",
			inputSchema: z.object({
				duration: z.number().positive().describe("seconds of simulated time"),
				probes: z.array(z.string().min(1)).min(1).describe('Parts ("C1") or pins ("R1.b") to record'),
				samples: z.number().int().min(1).max(MAX_SAMPLES).optional().describe(`How many times to record (default ${DEFAULT_SAMPLES})`),
				pressed: pressedSchema,
			}),
			annotations: READ_ONLY,
		},
		({ duration, probes, samples = DEFAULT_SAMPLES, pressed }) => {
			const circuit = document.circuit
			const targets = probes.map((probe) => ({ probe, found: findProbeTarget(circuit, probe) }))
			const unknown = targets.flatMap(({ found }) => ("error" in found ? [found.error] : []))
			if (unknown.length > 0) return failure(unknown.join("\n"))

			const { timeStep } = circuit.simulation
			const steps = Math.round(duration / timeStep)
			if (steps > options.maxTransientSteps) {
				return failure(
					`That is ${steps} steps of ${timeStep} s; the limit is ${options.maxTransientSteps}. Use a shorter duration or a larger time step (set_simulation).`,
				)
			}

			const sampleSteps = new Set(Array.from({ length: samples }, (_, index) => Math.round(((index + 1) * steps) / samples)))
			const recorded: { time: number; values: Record<string, unknown> }[] = []
			let state: TransientState = initialTransientState()
			for (let step = 1; step <= steps; step++) {
				const result = stepTransient(circuit, state, { timeStep, ...inputsOf(pressed) })
				if (!result.ok) return failure(result.errors)
				state = result.state
				if (!sampleSteps.has(step)) continue
				const values = Object.fromEntries(
					targets.flatMap(({ probe, found }) => ("error" in found ? [] : [[probe, probeValues(result.solution, found)]])),
				)
				recorded.push({ time: Number(state.time.toPrecision(6)), values })
			}
			return text({ timeStep, samples: recorded })
		},
	)

	server.registerTool(
		"set_simulation",
		{
			description:
				"Change how time runs: timeStep (seconds per step; smaller is more accurate and slower), speed (simulated seconds per real second in the app), and logicHigh (volts for logic 1; logic inputs read 1 above half of it).",
			inputSchema: z.object({
				timeStep: z.number().positive().optional(),
				speed: z.number().positive().optional(),
				logicHigh: z.number().positive().optional(),
			}),
		},
		({ timeStep, speed, logicHigh }) => edit({ type: "set-simulation", timeStep, speed, logicHigh }),
	)

	server.registerTool(
		"explain_circuit",
		{
			description:
				"Facts for explaining the circuit to a learner: parts with units, which pins share a node, simulated values, warnings or errors, and the edit history.",
			annotations: READ_ONLY,
		},
		() => text(explanation(document.circuit, document.history)),
	)

	server.registerTool(
		"open_circuit",
		{
			description: "Open a circuit JSON file (replaces the current circuit; undo brings it back).",
			inputSchema: z.object({ path: z.string().min(1) }),
		},
		async ({ path }) => {
			const fullPath = resolve(options.workspaceDirectory, path)
			try {
				const { size } = await stat(fullPath)
				if (size > options.maxFileBytes) return failure(`File is ${size} bytes; the limit is ${options.maxFileBytes}`)
				const parsed = parseCircuitJson(await readFile(fullPath, "utf8"))
				if (!parsed.ok) return failure(parsed.errors)
				document.replace(parsed.circuit, "agent", `Opened ${fullPath}`)
				return text(`Opened "${parsed.circuit.name}" from ${fullPath}`)
			} catch (error) {
				return failure(`Could not read ${fullPath}: ${error instanceof Error ? error.message : String(error)}`)
			}
		},
	)

	server.registerTool(
		"save_circuit",
		{
			description: "Save the current circuit as a JSON file.",
			inputSchema: z.object({ path: z.string().min(1) }),
		},
		async ({ path }) => {
			const fullPath = resolve(options.workspaceDirectory, path)
			try {
				await writeFile(fullPath, serializeCircuit(document.circuit), "utf8")
				return text(`Saved to ${fullPath}`)
			} catch (error) {
				return failure(`Could not save ${fullPath}: ${error instanceof Error ? error.message : String(error)}`)
			}
		},
	)

	server.registerTool(
		"rename_circuit",
		{ description: "Give the circuit a new name.", inputSchema: z.object({ name: z.string().min(1) }) },
		({ name }) => edit({ type: "rename-circuit", name }),
	)

	let activeLesson: Lesson | undefined
	const lessonIds = LESSONS.map((lesson) => lesson.id).join(", ")
	const unknownLesson = (id: string) => failure(`No lesson "${id}". Lessons: ${lessonIds}.`)

	server.registerTool(
		"list_lessons",
		{ description: "The starter lessons, in teaching order.", annotations: READ_ONLY },
		() => text(LESSONS.map(({ id, title, level, summary }) => ({ id, title, level, summary }))),
	)

	server.registerTool(
		"load_lesson",
		{
			description:
				"Start a lesson: replaces the circuit with a fresh one named after it (undo brings the old one back). Returns the goal, steps and checks to share, and hints for you to give one at a time.",
			inputSchema: z.object({ id: z.string().min(1) }),
		},
		({ id }) => {
			const lesson = lessonById(id)
			if (!lesson) return unknownLesson(id)
			activeLesson = lesson
			document.replace({ ...createCircuit(lesson.title), description: lesson.goal }, "agent", `Started lesson "${lesson.title}"`)
			return text({
				id: lesson.id,
				title: lesson.title,
				goal: lesson.goal,
				steps: lesson.steps.map((step) => step.text),
				checks: lesson.checks.map((check) => check.description),
				hintsForTutor: lesson.steps.flatMap((step) => (step.hint ? [step.hint] : [])),
			})
		},
	)

	server.registerTool(
		"check_solution",
		{
			description:
				"Check the current circuit against the lesson (the one loaded, or `id`): each check passes or says what the circuit actually does.",
			inputSchema: z.object({ id: z.string().min(1).optional() }),
			annotations: READ_ONLY,
		},
		({ id }) => {
			const lesson = id ? lessonById(id) : activeLesson
			if (id && !lesson) return unknownLesson(id)
			if (!lesson) return failure("No lesson is loaded. Start one with load_lesson (see list_lessons).")
			return text({ lesson: lesson.id, ...checkSolution(document.circuit, lesson) })
		},
	)

	server.registerPrompt(
		"tutor",
		{
			title: "Tutor a lesson",
			description: "Coach the learner through a lesson in the app: hints and questions, not ready-made answers.",
			argsSchema: z.object({
				lesson: completable(z.string().describe("Lesson id, e.g. light-an-led"), (value) =>
					LESSONS.map((lesson) => lesson.id).filter((candidate) => candidate.startsWith(value)),
				),
			}),
		},
		({ lesson: id }) => {
			const lesson = lessonById(id)
			const title = lesson ? `"${lesson.title}" (${lesson.id})` : `"${id}" (unknown: call list_lessons)`
			return {
				messages: [
					{
						role: "user" as const,
						content: {
							type: "text" as const,
							text: `Tutor me through the lesson ${title} in EngineeringCircuit.
- Call load_lesson, explain the goal in plain words, and offer open_in_app so I can build it myself while you watch.
- Let me build. Don't build it for me unless I ask; then build one step and explain it.
- Give one hint at a time, only when I'm stuck, and ask a question that leads me to the next idea.
- Use recent_changes to see what I did, and simulate / probe to explain with real numbers from my circuit.
- When I think I'm done, call check_solution. Praise what passes; for what fails, explain what my circuit actually does and why, and hint at the fix.
- Keep it short and friendly, for a beginner.`,
						},
					},
				],
			}
		},
	)

	server.registerTool(
		"open_in_app",
		{
			description:
				"A link the learner opens in their browser (with the app running: pnpm web) to watch and edit this same circuit live.",
			annotations: READ_ONLY,
		},
		() =>
			context.live
				? text(`Open this link in the browser where the app runs:\n${context.live.link}`)
				: failure("The live link is off: the server was started without it (see apps/mcp/src/main.ts)."),
	)

	server.registerTool(
		"recent_changes",
		{
			description:
				"Changes to the circuit since you last called this, by either author. Use it to see what the learner did in the app.",
			annotations: READ_ONLY,
		},
		() => {
			const unseen = changes.filter((change) => change.revision > seenRevision)
			seenRevision = document.revision
			return text({ revision: document.revision, changes: unseen })
		},
	)

	return server
}
