import { expect, test } from "vitest"
import { PART_LIST, partRequestPrompt, searchParts } from "./part-search"

test("every part is listed once, with its category, except chips (each circuit has its own)", () => {
	const types = PART_LIST.map((part) => part.type)
	expect(new Set(types).size).toBe(types.length)
	expect(types).not.toContain("subcircuit")
	expect(PART_LIST.find((part) => part.type === "resistor")).toMatchObject({ name: "Resistor", category: "Passive" })
})

test("a search finds parts by name, type, category, pin or parameter, every word of it, ignoring capitals; names first", () => {
	expect(searchParts("motor").map((part) => part.type)).toEqual(["dc-motor"])
	expect(searchParts("8 bit").map((part) => part.type)).toEqual(expect.arrayContaining(["adc-8bit", "dac-8bit"]))
	expect(searchParts("CAPACITANCE").map((part) => part.type)).toEqual(expect.arrayContaining(["capacitor", "polarized-capacitor"]))
	// "transistor" names two parts and describes others' parameters: the named ones come first.
	expect(searchParts("transistor").slice(0, 2).map((part) => part.type).sort()).toEqual(["npn-transistor", "pnp-transistor"])
	expect(searchParts("zzz")).toEqual([])
	expect(searchParts("  ")).toHaveLength(PART_LIST.length)
})

test("a part request becomes a message for the agent that asks for sources and a review", () => {
	const prompt = partRequestPrompt("  an NTC thermistor, 10 kΩ  ")
	expect(prompt).toContain("an NTC thermistor, 10 kΩ")
	expect(prompt).toContain("part_request_guide")
	expect(prompt).toContain("save_part_request")
	expect(prompt).toContain("datasheet")
})
