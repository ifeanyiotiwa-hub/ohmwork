import { COMPONENT_DEFINITIONS } from "@ohmwork/format"
import { expect, test } from "vitest"
import { isDcSimulated } from "../../src/dc/branches"

test("every part in the catalog can be simulated (since D4)", () => {
	expect(COMPONENT_DEFINITIONS.filter((definition) => !isDcSimulated(definition.type)).map((definition) => definition.type)).toEqual([])
})
