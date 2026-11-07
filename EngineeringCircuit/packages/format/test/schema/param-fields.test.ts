import { expect, test } from "vitest"
import { paramFieldsOf } from "../../src/schema/components/param-fields"

test("a resistor has one positive number in ohms", () => {
	expect(paramFieldsOf("resistor")).toEqual([
		{ name: "resistance", kind: "number", description: "ohms", positiveOnly: true },
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
	expect(paramFieldsOf("led")).toEqual([
		{ name: "color", kind: "choice", description: "", options: ["red", "green", "blue", "yellow", "white"] },
	])
})

test("ground has no fields", () => {
	expect(paramFieldsOf("ground")).toEqual([])
})
