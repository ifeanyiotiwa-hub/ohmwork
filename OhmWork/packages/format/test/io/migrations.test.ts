import { expect, test } from "vitest"
import { type Migration, migrate } from "../../src/io/migrations"

const renameTitle: Migration = ({ title, ...rest }) => ({ ...rest, name: title })
const addDescription: Migration = (document) => ({ ...document, description: "" })

test("applies each step in order and stamps the new version", () => {
	const result = migrate({ version: 1, title: "Old" }, 1, 3, { 1: renameTitle, 2: addDescription })
	expect(result).toEqual({ ok: true, document: { version: 3, name: "Old", description: "" } })
})

test("current version needs no migration", () => {
	expect(migrate({ version: 1 }, 1, 1, {})).toEqual({ ok: true, document: { version: 1 } })
})

test("reports a missing step", () => {
	expect(migrate({ version: 1 }, 1, 3, { 1: addDescription })).toEqual({
		ok: false,
		message: "No migration from version 2 to 3",
	})
})
