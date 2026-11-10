import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { CircuitDocument, type DocumentChange, type EditCommand } from "@ohmwork/editing"
import {
	type Complex,
	advanceTransient,
	gainAndPhase,
	initialTransientState,
	solveAc,
	solveDc,
	sweepFrequencies,
	usesFixedSteps,
} from "@ohmwork/engine"
import {
	COMPONENT_DEFINITIONS,
	type ComponentType,
	type PinRef,
	createCircuit,
	expandSubcircuits,
	parseCircuitJson,
	pinKey,
	pinsOfPart,
	rotationSchema,
	serializeCircuit,
} from "@ohmwork/format"
import { LESSONS, RC_CHARGING, checkSolution, lessonById, lessonSchema } from "@ohmwork/lessons"
import { type CallToolResult, McpServer, completable } from "@modelcontextprotocol/server"
import * as z from "zod"
import type { LiveServer } from "./live/live-server"
import { partRequestErrors, partRequestGuide, partRequestMarkdown, partRequestSchema } from "./part-request"
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

const INSTRUCTIONS = `OhmWork: build, simulate and explain electronic circuits with a learner.
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
Lessons: list_lessons, load_lesson, then let the learner build; check_solution tells you what passes and what the circuit actually does. Use the "tutor" prompt for the coaching style. To write a new lesson or challenge: lesson_format, build a correct circuit, then save_lesson_draft.
Logic parts need no supply pins: outputs are 0 V or logic high (default 5 V) from ground, inputs read 1 above half of it, and each gate or flip-flop takes one time step to respond. Clocks, flip-flops and counters need simulate_over_time; simulate settles static logic and reports oscillators.
Net labels (net-label, params.name) connect every pin wired to a label of the same name, with no wire between: use them for supplies (VCC) and long or crossing runs.
A part the app lacks: part_request_guide, then save_part_request (every value from a datasheet, listed as a source) saves a draft for a person to review.
Chips: make_chip turns parts into a reusable chip (a subcircuit); probe its pins ("X1.out") or the parts inside it ("X1.R1").
Buses (bus-4, bus-8, params.name): connectors of one name join pin by pin (d3 to d3) and are drawn as one thick line; a net label named <bus name><n> (e.g. "D3") taps member n.
Filters and amplifiers: frequency_response sweeps an ac-source's frequency and gives gain (dB) and phase at a pin or across a part.
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
/** Where drafted parts are saved for review, inside the workspace. */
const PART_REQUESTS_FOLDER = "part-requests"
/** Where drafted lessons are saved for review, inside the workspace. */
const LESSON_DRAFTS_FOLDER = "lesson-drafts"
/** What makes a good lesson, for the agent drafting one (lesson_format). */
const LESSON_RULES = [
	"Build a correct circuit first: it is saved as the reference solution, and the draft is refused unless it passes every check.",
	"Check what the circuit does (readings, pin voltages, frequencies, gains), never part ids or positions, so any correct layout passes.",
	"Give every check a plain description of what it looks for, with the numbers: the learner reads it.",
	"Ranges, not exact values: allow for the parts a learner might choose (E12 values, ±5%).",
	"A lesson has steps with hints held back; a challenge (kind challenge) has a goal and no steps.",
	"Levels: beginner (one idea, a few parts), intermediate (op-amps, logic, flip-flops), advanced (timing, filters, design).",
]
const DEFAULT_SAMPLES = 20
const MAX_SAMPLES = 200
const DEFAULT_POINTS_PER_DECADE = 10
const MAX_POINTS_PER_DECADE = 100
const MAX_RESPONSE_POINTS = 1000
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
	const server = new McpServer({ name: "ohmwork", version: "0.1.0" }, { instructions: INSTRUCTIONS })
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
		"make_chip",
		{
			description:
				'Turn parts into a chip (a subcircuit), placed where they were: the wires between them go inside, and each wire to the rest of the circuit ends on a chip pin. Name the pins after what they do (pins: [{ name: "in", pin: "R1.a" }]); unnamed ones are named after the part and pin. Place more of it with add_component type "subcircuit", params { definition: <chip id> }.',
			inputSchema: z.object({
				componentIds: z.array(z.string().min(1)).min(1),
				name: z.string().min(1).max(40).describe("shown on the chip"),
				pins: z.array(z.object({ name: z.string().min(1), pin: pinLabelSchema })).optional(),
			}),
		},
		({ componentIds, name, pins }) => {
			const named = (pins ?? []).map(({ name: pinName, pin }) => ({ name: pinName, to: pinRef(pin) }))
			const unreadable = named.find((pin) => !pin.to)
			if (unreadable) return failure(`Pins are written "<componentId>.<pin>", e.g. "R1.a" (pin "${unreadable.name}")`)
			return edit({
				type: "make-subcircuit",
				componentIds,
				name,
				pins: named.flatMap(({ name: pinName, to }) => (to ? [{ name: pinName, to }] : [])),
			})
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

	server.registerTool("redo", { description: "Put back the change most recently undone (until a new change is made)." }, () => {
		const result = document.redo("agent")
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
			const fixed = usesFixedSteps(circuit)
			// Steps are never larger than the time step, so this many is the least either way of stepping takes.
			const steps = Math.round(duration / timeStep)
			if (steps > options.maxTransientSteps) {
				return failure(
					`That is ${steps} steps of ${timeStep} s; the limit is ${options.maxTransientSteps}. Use a shorter duration or a larger time step (set_simulation).`,
				)
			}

			// Record at the first step at or after each of `samples` evenly spaced times (adaptive steps vary in size).
			const recorded: { time: number; values: Record<string, unknown> }[] = []
			const sampleTimes = Array.from({ length: samples }, (_, index) => ((index + 1) * duration) / samples)
			const result = advanceTransient(circuit, initialTransientState(), duration, {
				maxStep: timeStep,
				maxSteps: options.maxTransientSteps,
				landOn: sampleTimes,
				...inputsOf(pressed),
				onStep: (state, solution) => {
					const due = sampleTimes[recorded.length]
					if (due === undefined || state.time < due * (1 - 1e-9)) return
					const values = Object.fromEntries(
						targets.flatMap(({ probe, found }) => ("error" in found ? [] : [[probe, probeValues(solution, found)]])),
					)
					recorded.push({ time: Number(state.time.toPrecision(6)), values })
				},
			})
			if (!result.ok) return failure(result.errors)
			if (!result.reachedUntil) {
				return failure(`That needed more than ${options.maxTransientSteps} steps. Use a shorter duration or a larger time step (set_simulation).`)
			}
			return text({ timeStep, stepping: fixed ? "fixed" : "adaptive", steps: result.steps, samples: recorded })
		},
	)

	server.registerTool(
		"frequency_response",
		{
			description:
				'Small-signal frequency response (as SPICE .ac): the circuit at its DC operating point, driven by its AC sources at each frequency of a log sweep. Gives gain (dB) and phase (degrees) of the output relative to the input AC source. output is a pin ("R1.b", from ground) or a two-pin part ("C1", across it). Every AC source drives at once; name the input when there are several.',
			inputSchema: z.object({
				output: z.string().min(1),
				start: z.number().positive().describe("hertz"),
				stop: z.number().positive().describe("hertz, at least start"),
				pointsPerDecade: z
					.number()
					.int()
					.min(1)
					.max(MAX_POINTS_PER_DECADE)
					.optional()
					.describe(`default ${DEFAULT_POINTS_PER_DECADE}`),
				input: z.string().min(1).optional().describe("The AC source the gain is relative to"),
			}),
			annotations: READ_ONLY,
		},
		({ output, start, stop, pointsPerDecade = DEFAULT_POINTS_PER_DECADE, input }) => {
			const circuit = document.circuit
			if (stop < start) return failure("stop must be at least start.")
			const sources = circuit.components.filter((component) => component.type === "ac-source")
			if (sources.length === 0) return failure("A frequency response needs an AC source as its input; add an ac-source.")
			const source = input === undefined && sources.length === 1 ? sources[0] : sources.find((candidate) => candidate.id === input)
			if (source?.type !== "ac-source") {
				return failure(`Name the input AC source (one of ${sources.map((candidate) => candidate.id).join(", ")}).`)
			}
			const found = findProbeTarget(circuit, output)
			if ("error" in found) return failure(found.error)
			if (found.kind === "ports") return failure(`Give one pin of "${output}" (as "${output}.<pin>"); it has more than two.`)
			const frequencies = sweepFrequencies({ start, stop, pointsPerDecade })
			if (frequencies.length > MAX_RESPONSE_POINTS) {
				return failure(`That is ${frequencies.length} points; the limit is ${MAX_RESPONSE_POINTS}. Narrow the range or use fewer points per decade.`)
			}
			const result = solveAc(circuit, { frequencies })
			if (!result.ok) return failure(result.errors)

			const phase = (source.params.phase * Math.PI) / 180
			const inputPhasor: Complex = { re: source.params.amplitude * Math.cos(phase), im: source.params.amplitude * Math.sin(phase) }
			// A pin from ground, or across a two-pin part (perhaps inside a chip) from its first pin to its second.
			const across = found.kind === "pin" ? undefined : expandSubcircuits(circuit).components.find((part) => part.id === found.componentId)
			const keys =
				found.kind === "pin"
					? [pinKey(found.pin)]
					: (across ? pinsOfPart(across, circuit) : []).map((pin) => pinKey({ componentId: found.componentId, pin }))
			const zero: Complex = { re: 0, im: 0 }
			const points = result.points.map((point) => {
				const [high = zero, low = zero] = keys.map((key) => point.pinVoltages[key] ?? zero)
				const response = gainAndPhase({ re: high.re - low.re, im: high.im - low.im }, inputPhasor)
				return {
					frequency: Number(point.frequency.toPrecision(6)),
					gainDb: Number(response.decibels.toFixed(3)),
					phaseDegrees: Number(((response.phase * 180) / Math.PI).toFixed(2)),
				}
			})
			return text({ input: source.id, output, points })
		},
	)

	server.registerTool(
		"set_simulation",
		{
			description:
				"Change how time runs: timeStep (seconds per step; smaller is more accurate and slower), speed (simulated seconds per real second in the app), logicHigh (volts for logic 1; logic inputs read 1 above half of it), temperature (°C of every part; diodes and transistors change with it; 27 is SPICE's nominal), and stepping (adaptive: steps as small as accuracy needs, up to timeStep; fixed: always timeStep; circuits with logic always step fixed).",
			inputSchema: z.object({
				timeStep: z.number().positive().optional(),
				speed: z.number().positive().optional(),
				logicHigh: z.number().positive().optional(),
				temperature: z.number().gt(-273.15).optional(),
				stepping: z.enum(["fixed", "adaptive"]).optional(),
			}),
		},
		({ timeStep, speed, logicHigh, temperature, stepping }) => edit({ type: "set-simulation", timeStep, speed, logicHigh, temperature, stepping }),
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
			description: "Open a circuit JSON file in the workspace folder (path relative to it; replaces the current circuit; undo brings it back).",
			inputSchema: z.object({ path: z.string().min(1) }),
		},
		async ({ path }) => {
			const fullPath = insideWorkspace(options.workspaceDirectory, path)
			if (!fullPath) return failure(outsideWorkspace(options.workspaceDirectory, path))
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
			description: "Save the current circuit as a JSON file in the workspace folder (path relative to it).",
			inputSchema: z.object({ path: z.string().min(1) }),
		},
		async ({ path }) => {
			const fullPath = insideWorkspace(options.workspaceDirectory, path)
			if (!fullPath) return failure(outsideWorkspace(options.workspaceDirectory, path))
			try {
				await writeFile(fullPath, serializeCircuit(document.circuit), "utf8")
				return text(`Saved to ${fullPath}`)
			} catch (error) {
				return failure(`Could not save ${fullPath}: ${error instanceof Error ? error.message : String(error)}`)
			}
		},
	)

	server.registerTool(
		"lesson_format",
		{
			description:
				"Before drafting a lesson or challenge: the lesson format as JSON Schema (every kind of check and what it measures), the rules for a good lesson, and an example.",
			annotations: READ_ONLY,
		},
		() =>
			text({
				rules: LESSON_RULES,
				schema: z.toJSONSchema(lessonSchema),
				example: RC_CHARGING,
			}),
	)

	server.registerTool(
		"save_lesson_draft",
		{
			description:
				"Save a drafted lesson or challenge for a person to review, as lesson-drafts/<id>.json in the workspace with the current circuit as its reference solution. Build a correct circuit first: the draft is saved only if that circuit passes every check and an empty circuit does not.",
			inputSchema: z.object({ lesson: lessonSchema }),
		},
		async ({ lesson }) => {
			if (lessonById(lesson.id)) return failure(`"${lesson.id}" is already a lesson; choose another id.`)
			const solved = checkSolution(document.circuit, lesson)
			if (!solved.passed) {
				const failed = solved.results.filter((result) => !result.passed).map((result) => `${result.description}: ${result.found}`)
				return failure(`The current circuit, the reference solution, does not pass every check:\n${failed.join("\n")}`)
			}
			if (checkSolution(createCircuit("Empty"), lesson).passed) {
				return failure("An empty circuit passes every check too: add checks that only a working circuit passes.")
			}
			const fullPath = insideWorkspace(options.workspaceDirectory, join(LESSON_DRAFTS_FOLDER, `${lesson.id}.json`))
			if (!fullPath) return failure(outsideWorkspace(options.workspaceDirectory, LESSON_DRAFTS_FOLDER))
			try {
				await mkdir(dirname(fullPath), { recursive: true })
				await writeFile(fullPath, JSON.stringify({ lesson, referenceSolution: document.circuit }, null, 2), "utf8")
				return text(`Saved the draft for review: ${fullPath}`)
			} catch (error) {
				return failure(`Could not save ${fullPath}: ${error instanceof Error ? error.message : String(error)}`)
			}
		},
	)

	server.registerTool(
		"part_request_guide",
		{
			description:
				"Before drafting a part the app lacks (the learner asked for one): the rules for a new part, the categories, the types and id prefixes already taken, and the unit words the app shows with symbols. Use list_component_types to see how similar parts are described.",
			annotations: READ_ONLY,
		},
		() => text(partRequestGuide()),
	)

	server.registerTool(
		"save_part_request",
		{
			description:
				"Save a drafted new part for a person to review, as part-requests/<type>.md in the workspace: its COMPONENTS.md row, its catalog entry as code, its sources and the steps to add it. Every value must come from a source you list. Nothing is added to the app.",
			inputSchema: z.object({ request: partRequestSchema }),
		},
		async ({ request }) => {
			const problems = partRequestErrors(request)
			if (problems.length > 0) return failure(problems.join("\n"))
			const fullPath = insideWorkspace(options.workspaceDirectory, join(PART_REQUESTS_FOLDER, `${request.type}.md`))
			if (!fullPath) return failure(outsideWorkspace(options.workspaceDirectory, PART_REQUESTS_FOLDER))
			try {
				await mkdir(dirname(fullPath), { recursive: true })
				await writeFile(fullPath, partRequestMarkdown(request, new Date()), "utf8")
				return text(`Saved the request for review: ${fullPath}`)
			} catch (error) {
				return failure(`Could not save ${fullPath}: ${error instanceof Error ? error.message : String(error)}`)
			}
		},
	)

	server.registerTool(
		"add_note",
		{
			description:
				"Leave a text note on the canvas for the learner (an explanation next to a part). x, y place it (canvas units; see get_circuit pin positions).",
			inputSchema: z.object({ text: z.string().min(1), x: z.number().optional(), y: z.number().optional() }),
		},
		({ text: note, x, y }) =>
			edit({ type: "add-note", note: { text: note, position: x === undefined || y === undefined ? undefined : { x, y } } }),
	)

	server.registerTool(
		"remove_note",
		{ description: "Remove a note by its id (see get_circuit).", inputSchema: z.object({ noteId: z.string().min(1) }) },
		({ noteId }) => edit({ type: "remove-note", noteId }),
	)

	server.registerTool(
		"rename_circuit",
		{ description: "Give the circuit a new name.", inputSchema: z.object({ name: z.string().min(1) }) },
		({ name }) => edit({ type: "rename-circuit", name }),
	)

	const lessonIds = LESSONS.map((lesson) => lesson.id).join(", ")
	const unknownLesson = (id: string) => failure(`No lesson "${id}". Lessons: ${lessonIds}.`)

	server.registerTool(
		"list_lessons",
		{ description: "The lessons and challenges (a goal, no steps), in teaching order.", annotations: READ_ONLY },
		() => text(LESSONS.map(({ id, title, level, kind, summary }) => ({ id, title, level, kind, summary }))),
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
			document.replace(
				{ ...createCircuit(lesson.title), description: lesson.goal, lesson: lesson.id },
				"agent",
				`Started lesson "${lesson.title}"`,
			)
			return text({
				id: lesson.id,
				title: lesson.title,
				kind: lesson.kind,
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
				"Check the current circuit against its lesson (the one it was started for, or `id`): each check passes or says what the circuit actually does.",
			inputSchema: z.object({ id: z.string().min(1).optional() }),
			annotations: READ_ONLY,
		},
		({ id }) => {
			const current = document.circuit.lesson
			const lesson = id ? lessonById(id) : current ? lessonById(current) : undefined
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
							text: `Tutor me through the lesson ${title} in OhmWork.
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

/** The file's full path if it is inside the workspace folder (the agent's files stay there), else undefined. */
function insideWorkspace(workspace: string, path: string): string | undefined {
	const fullPath = resolve(workspace, path)
	const fromWorkspace = relative(workspace, fullPath)
	const above = fromWorkspace === ".." || fromWorkspace.startsWith(`..${sep}`)
	return above || isAbsolute(fromWorkspace) ? undefined : fullPath
}

const outsideWorkspace = (workspace: string, path: string) =>
	`${path} is outside the workspace folder (${workspace}); circuit files are read and saved only inside it.`
