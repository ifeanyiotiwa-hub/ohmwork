import { expect, test } from "vitest"
import { paramFieldsOf } from "../../src/schema/components/param-fields"

test("a resistor has a resistance in ohms and a power rating in watts, both positive", () => {
	expect(paramFieldsOf("resistor")).toEqual([
		{ name: "resistance", kind: "number", description: "ohms", positiveOnly: true },
		{
			name: "powerRating",
			kind: "number",
			description: "watts it can turn into heat safely; more is reported as burning it out",
			positiveOnly: true,
		},
	])
})

test("a voltage source accepts any number, including negative", () => {
	expect(paramFieldsOf("voltage-source")).toEqual([
		{ name: "voltage", kind: "number", description: "volts", positiveOnly: false },
	])
})

test("a switch has an on/off field", () => {
	expect(paramFieldsOf("switch")).toEqual([{ name: "closed", kind: "boolean", description: "true = conducting" }])
})

test("an LED colour is a choice", () => {
	expect(paramFieldsOf("led")[0]).toEqual({
		name: "color",
		kind: "choice",
		description: "",
		options: ["red", "green", "blue", "yellow", "white"],
	})
})

test("ground has no fields", () => {
	expect(paramFieldsOf("ground")).toEqual([])
})

test("a number with both limits carries its range, for a slider", () => {
	expect(paramFieldsOf("potentiometer")).toContainEqual({
		name: "position",
		kind: "number",
		description: "wiper position from pin a (0) to pin b (1)",
		positiveOnly: false,
		range: { min: 0, max: 1 },
	})
})
