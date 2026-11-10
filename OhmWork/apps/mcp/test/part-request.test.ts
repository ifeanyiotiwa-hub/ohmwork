import { describe, expect, test } from "vitest"
import { type PartRequest, partRequestErrors, partRequestGuide, partRequestMarkdown } from "../src/part-request"

/** A thermistor, as an agent might draft it from a datasheet. */
const thermistor = (): PartRequest => ({
	type: "thermistor",
	name: "Thermistor (NTC)",
	category: "Passive",
	idPrefix: "TH",
	pins: ["a", "b"],
	params: [
		{ name: "resistance", kind: "positive", unit: "ohms", description: "at 25 °C", default: 10000 },
		{ name: "beta", kind: "positive", unit: "", description: "B constant, kelvin", default: 3950 },
		{ name: "selfHeating", kind: "boolean", unit: "", description: "warm itself with its own power", default: false },
	],
	model: "resistor R = R25·exp(B·(1/T − 1/298.15 K)) at the circuit temperature",
	seenIn: "CJS (thermistor)",
	sources: [{ title: "Vishay NTCLE100E3 datasheet", url: "https://www.vishay.com/docs/29049/ntcle100.pdf" }],
})

describe("checking a request", () => {
	test("a complete request for a new part passes", () => {
		expect(partRequestErrors(thermistor())).toEqual([])
	})

	test("a part that exists, a prefix in use, repeated pins, a default of the wrong kind and no sources are each refused", () => {
		const errors = partRequestErrors({
			...thermistor(),
			type: "resistor",
			idPrefix: "R",
			pins: ["a", "a"],
			params: [{ name: "resistance", kind: "positive", unit: "ohms", description: "", default: -1 }],
			sources: [],
		})
		expect(errors).toEqual([
			expect.stringContaining('"resistor" is already a part'),
			expect.stringContaining('prefix "R" is used by resistor'),
			expect.stringContaining('pin "a" twice'),
			expect.stringContaining("resistance: the default must be a positive number"),
			expect.stringContaining("at least one source"),
		])
	})

	test("a choice needs its default among its options", () => {
		const errors = partRequestErrors({
			...thermistor(),
			params: [{ name: "curve", kind: "choice", options: ["a", "b"], unit: "", description: "", default: "c" }],
		})
		expect(errors).toEqual([expect.stringContaining('curve: the default must be one of "a", "b"')])
	})
})

test("the draft for review has the COMPONENTS.md row, the catalog entry as code, the sources and the checklist", () => {
	const markdown = partRequestMarkdown(thermistor(), new Date("2026-11-10T12:00:00Z"))
	expect(markdown).toContain("# Part request: Thermistor (NTC) (`thermistor`)")
	expect(markdown).toContain("Drafted by the agent on 2026-11-10, for review")
	expect(markdown).toContain(
		"| `thermistor` | a, b | resistance (ohms, at 25 °C), beta (B constant, kelvin), selfHeating (warm itself with its own power) | resistor R = R25·exp(B·(1/T − 1/298.15 K)) at the circuit temperature | CJS (thermistor) | – | requested |",
	)
	expect(markdown).toContain("packages/format/src/schema/components/passives.ts")
	expect(markdown).toContain(`	defineComponent("thermistor", {
		idPrefix: "TH",
		pins: ["a", "b"],
		params: {
			resistance: positive("ohms, at 25 °C"),
			beta: positive("B constant, kelvin"),
			selfHeating: z.boolean().describe("warm itself with its own power"),
		},
		defaults: { resistance: 10000, beta: 3950, selfHeating: false },
	}),`)
	expect(markdown).toContain("- [Vishay NTCLE100E3 datasheet](https://www.vishay.com/docs/29049/ntcle100.pdf)")
	expect(markdown).toContain("- [ ] Add the part to `DC_MODELS`")
})

test("the guide lists the categories, the types and prefixes taken, and the units the app shows", () => {
	const guide = partRequestGuide()
	expect(guide.categories).toContain("Passive")
	expect(guide.takenTypes).toContain("resistor")
	expect(guide.takenPrefixes).toContain("R")
	expect(guide.units).toContain("ohms")
	expect(guide.rules.join(" ")).toContain("datasheet")
})
