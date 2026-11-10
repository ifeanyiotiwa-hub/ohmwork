// "Request a part": the agent drafts a new part from sources, as structured data; this checks it against the catalog
// and turns it into what a reviewer needs (the COMPONENTS.md row and the catalog entry as code), so no code is free text.
import { COMPONENT_CATEGORIES, COMPONENT_DEFINITIONS, UNIT_WORDS, isComponentType } from "@ohmwork/format"
import * as z from "zod"

const PARAM_KINDS = ["positive", "number", "boolean", "text", "choice"] as const

export const partRequestSchema = z.object({
	type: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "a type is kebab-case, e.g. thermistor or dc-motor"),
	name: z.string().min(1).max(40).describe("shown in the palette"),
	category: z.enum(COMPONENT_CATEGORIES.map((category) => category.name) as [string, ...string[]]),
	idPrefix: z.string().regex(/^[A-Z]+$/, "capital letters, e.g. TH"),
	pins: z.array(z.string().regex(/^[a-z][A-Za-z0-9]*$/, "pins are camelCase")).min(1),
	params: z.array(
		z.object({
			name: z.string().regex(/^[a-z][A-Za-z0-9]*$/, "parameters are camelCase"),
			kind: z.enum(PARAM_KINDS),
			options: z.array(z.string().min(1)).optional().describe("for kind choice"),
			unit: z.string().describe(`one of ${UNIT_WORDS.join(", ")} to be shown with its symbol; empty for none`),
			description: z.string(),
			default: z.union([z.number(), z.boolean(), z.string()]),
		}),
	),
	model: z.string().min(1).describe("how it is simulated"),
	seenIn: z.string().describe("where the part appears: EC (EveryCircuit), CJS (CircuitJS1), a datasheet…"),
	sources: z.array(z.object({ title: z.string().min(1), url: z.url().optional() })),
	notes: z.string().optional(),
})
export type PartRequest = z.infer<typeof partRequestSchema>

/** Which file in packages/format/src/schema/components/ a category's parts are defined in. */
const CATEGORY_FILES: Readonly<Record<string, string>> = {
	Sources: "sources.ts",
	Passive: "passives.ts",
	Switches: "switches.ts",
	Semiconductors: "semiconductors.ts",
	Logic: "logic.ts",
	ICs: "ics.ts",
	Meters: "measurement.ts",
}

/** What the agent needs to draft a part that fits: the rules, and what is already taken. */
export function partRequestGuide() {
	return {
		rules: [
			"Take every number from a datasheet or a manufacturer's SPICE model, and list it under sources (title and URL); never guess values.",
			"Prefer one part type per real part family; a part's pins never change with a setting (make separate types, as bus-4 and bus-8).",
			"SI units everywhere; start a parameter's unit with one of the unit words so the app shows its symbol.",
			"Describe the model in a sentence a reviewer can check against SPICE or CircuitJS1.",
			"The draft is saved for a person to review; nothing is added to the app until they do.",
		],
		categories: COMPONENT_CATEGORIES.map((category) => category.name),
		takenTypes: COMPONENT_DEFINITIONS.map((definition) => definition.type),
		takenPrefixes: COMPONENT_DEFINITIONS.map((definition) => definition.idPrefix),
		units: UNIT_WORDS,
	}
}

const describedAs = ({ unit, description }: { unit: string; description: string }) => [unit, description].filter(Boolean).join(", ")

/** Everything that would stop the draft from becoming a valid part; empty when it is complete. */
export function partRequestErrors(request: PartRequest): string[] {
	const errors: string[] = []
	if (isComponentType(request.type)) errors.push(`"${request.type}" is already a part`)
	const prefixOwner = COMPONENT_DEFINITIONS.find((definition) => definition.idPrefix === request.idPrefix)
	if (prefixOwner) errors.push(`The id prefix "${request.idPrefix}" is used by ${prefixOwner.type}`)
	for (const pin of new Set(request.pins.filter((pin, index) => request.pins.indexOf(pin) !== index))) errors.push(`It has pin "${pin}" twice`)
	for (const param of request.params) {
		const wrong = defaultProblem(param)
		if (wrong) errors.push(`${param.name}: the default must be ${wrong}`)
	}
	if (request.sources.length === 0) errors.push("Give at least one source (a datasheet or a SPICE model) for its values")
	return errors
}

function defaultProblem(param: PartRequest["params"][number]): string | undefined {
	const value = param.default
	switch (param.kind) {
		case "positive":
			return typeof value === "number" && value > 0 ? undefined : "a positive number"
		case "number":
			return typeof value === "number" ? undefined : "a number"
		case "boolean":
			return typeof value === "boolean" ? undefined : "true or false"
		case "text":
			return typeof value === "string" && value.trim() !== "" ? undefined : "some text"
		case "choice": {
			const options = param.options ?? []
			return options.includes(String(value)) ? undefined : `one of ${options.map((option) => `"${option}"`).join(", ")}`
		}
	}
}

/** The zod expression for one parameter, as written in the catalog files. */
function paramCode(param: PartRequest["params"][number]): string {
	const text = JSON.stringify(describedAs(param))
	switch (param.kind) {
		case "positive":
			return `positive(${text})`
		case "number":
			return `z.number().describe(${text})`
		case "boolean":
			return `z.boolean().describe(${text})`
		case "text":
			return `z.string().min(1).describe(${text})`
		case "choice":
			return `z.enum(${JSON.stringify(param.options ?? [])}).describe(${text})`
	}
}

/** The draft as Markdown for review: the COMPONENTS.md row, the catalog entry, the sources and the checklist. */
export function partRequestMarkdown(request: PartRequest, drafted: Date): string {
	const pins = request.pins.join(", ")
	const params = request.params.map((param) => `${param.name} (${describedAs(param)})`).join(", ") || "–"
	const defaults = request.params.map((param) => `${param.name}: ${JSON.stringify(param.default)}`).join(", ")
	const code = [
		`\tdefineComponent(${JSON.stringify(request.type)}, {`,
		`\t\tidPrefix: ${JSON.stringify(request.idPrefix)},`,
		`\t\tpins: [${request.pins.map((pin) => JSON.stringify(pin)).join(", ")}],`,
		"\t\tparams: {",
		...request.params.map((param) => `\t\t\t${param.name}: ${paramCode(param)},`),
		"\t\t},",
		`\t\tdefaults: { ${defaults} },`,
		"\t}),",
	].join("\n")
	const sources = request.sources.map((source) => (source.url ? `- [${source.title}](${source.url})` : `- ${source.title}`))
	return [
		`# Part request: ${request.name} (\`${request.type}\`)`,
		"",
		`Drafted by the agent on ${drafted.toISOString().slice(0, 10)}, for review. Check every value against the sources before adding it.`,
		"",
		"## COMPONENTS.md row",
		"| Type | Pins | Params | Model | Seen in | Deliverable | Status |",
		"|---|---|---|---|---|---|---|",
		`| \`${request.type}\` | ${pins} | ${params} | ${request.model} | ${request.seenIn} | – | requested |`,
		"",
		`## Catalog entry (packages/format/src/schema/components/${CATEGORY_FILES[request.category] ?? "?"})`,
		"```ts",
		code,
		"```",
		"",
		"## Sources",
		...sources,
		...(request.notes ? ["", "## Notes", request.notes] : []),
		"",
		"## To add it (COMPONENTS.md, How to add a component)",
		"- [ ] Check the values against the sources, and add the row above to COMPONENTS.md",
		"- [ ] Paste the entry into its category file; add format tests for its params",
		"- [ ] Add the part to `DC_MODELS` in packages/engine/src/dc/branches.ts, with a golden test (ngspice or a textbook answer)",
		"- [ ] Place its pins in `PIN_OFFSETS` (packages/format/src/layout/pins.ts)",
		"- [ ] Draw it: `SYMBOLS` and `PART_NAMES` in apps/web/src/app/circuit/symbols.ts",
		"",
	].join("\n")
}
